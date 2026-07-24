import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { AdminService } from './admin/admin.service';
import { AuthController } from './auth/auth.controller';
import { BlogQueryDto } from './blogs/dto/blog-query.dto';
import { BlogsService } from './blogs/blogs.service';
import { CreateBlogDto } from './blogs/dto/create-blog.dto';
import { assertBlogTransition } from './common/workflow/blog-state-machine';
import { generateSlug } from './common/utils/slug.util';
import { RolesGuard } from './common/guards/roles.guard';
import { EditorialService } from './editorial/editorial.service';
import { BlogStatus, Prisma, Role } from './generated/prisma/client';
import { MediaCleanupService } from './uploads/media-cleanup.service';
import { detectImageMime } from './uploads/uploads.service';
import { THROTTLER_LIMIT } from '@nestjs/throttler/dist/throttler.constants';
import { validate } from 'class-validator';

describe('backend hardening', () => {
  const audit = { log: jest.fn() };

  function blogs(prisma: Record<string, unknown>) {
    return new BlogsService(
      prisma as never,
      audit as never,
      {} as never,
      {} as never,
    );
  }

  it('rejects a whitespace-only title after trimming', async () => {
    const pipe = new ValidationPipe({ transform: true });
    await expect(
      pipe.transform(
        { title: '   ', content: 'valid article content' },
        { type: 'body', metatype: CreateBlogDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    ['Arabic', 'القراءة حياة'],
    ['Malayalam', 'വായന ജീവിതമാണ്'],
    ['Urdu', 'مطالعہ زندگی ہے'],
  ])('creates a non-empty safe slug for %s', (_language, title) => {
    expect(generateSlug(title)).toMatch(/^[\p{L}\p{N}-]+$/u);
  });

  it('deduplicates tag IDs during DTO transformation', () => {
    const dto = plainToInstance(CreateBlogDto, {
      title: 'A valid title',
      content: 'A valid article body',
      tagIds: ['tag-1', 'tag-1', 'tag-2'],
    });
    expect(dto.tagIds).toEqual(['tag-1', 'tag-2']);
  });

  it('rejects an invalid workflow transition with 409 semantics', () => {
    expect(() =>
      assertBlogTransition(BlogStatus.PUBLISHED, BlogStatus.QUALITY_REVIEW),
    ).toThrow(ConflictException);
  });

  it('detects file signatures instead of trusting MIME metadata', () => {
    expect(detectImageMime(Buffer.from('not an image'))).toBeNull();
    expect(
      detectImageMime(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toBe('image/png');
  });

  it('rejects a stale concurrent autosave', async () => {
    const tx = {
      blog: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      blogTag: {},
    };
    const service = blogs({
      blog: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'blog-1',
          status: BlogStatus.DRAFT,
          revision: 2,
          createdById: 'editor-1',
          assignedEditorId: 'editor-1',
        }),
      },
      $transaction: (callback: (client: typeof tx) => unknown) => callback(tx),
    });

    await expect(
      service.autosave(
        'blog-1',
        { id: 'editor-1', role: Role.EDITOR },
        { title: 'New title', revision: 1 },
      ),
    ).rejects.toThrow('Autosave conflict');
  });

  it('blocks an editor from editing published content', async () => {
    const service = new EditorialService(
      {
        blog: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'blog-1',
            status: BlogStatus.PUBLISHED,
            assignedEditorId: 'editor-1',
          }),
        },
      } as never,
      audit as never,
    );
    await expect(
      service.edit(
        'blog-1',
        { id: 'editor-1', role: Role.EDITOR },
        { title: 'Changed title', revision: 1 },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects admin approval based on an old editorial version', async () => {
    const service = new AdminService(
      {
        blog: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'blog-1',
            status: BlogStatus.READY_FOR_ADMIN,
            revision: 4,
            editorialReviews: [{ id: 'review-1', blogRevision: 3 }],
          }),
        },
      } as never,
      audit as never,
    );
    await expect(service.approveBlog('admin-1', 'blog-1')).rejects.toThrow(
      'older article revision',
    );
  });

  it('rejects publish when editing invalidated the approved revision', async () => {
    const service = new AdminService(
      {
        blog: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'blog-1',
            status: BlogStatus.READY_FOR_ADMIN,
            revision: 5,
            approvedRevision: 4,
            approvedAt: new Date(),
            approvedById: 'admin-1',
            content: '<p>Changed after approval</p>',
          }),
        },
      } as never,
      audit as never,
    );
    await expect(service.publishBlog('admin-1', 'blog-1')).rejects.toThrow(
      'current article revision',
    );
  });

  it('retries a concurrent same-title slug conflict with a bound', async () => {
    const create = jest
      .fn()
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('duplicate slug', {
          code: 'P2002',
          clientVersion: '7.9.0',
          meta: { target: ['slug'] },
        }),
      )
      .mockResolvedValueOnce({ id: 'blog-2', slug: 'same-title-2' });
    const tx = {
      blog: { create },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = blogs({
      $transaction: (callback: (client: typeof tx) => unknown) => callback(tx),
    });
    await expect(
      service.create(
        { id: 'editor-1', role: Role.EDITOR },
        { title: 'Same title', content: 'A complete article body' },
      ),
    ).resolves.toMatchObject({ slug: 'same-title-2' });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('propagates an audit failure from the article transaction', async () => {
    const tx = {
      blog: {
        create: jest.fn().mockResolvedValue({ id: 'blog-1', slug: 'story' }),
      },
      auditLog: {
        create: jest.fn().mockRejectedValue(new Error('audit unavailable')),
      },
    };
    const service = blogs({
      $transaction: (callback: (client: typeof tx) => unknown) => callback(tx),
    });
    await expect(
      service.create(
        { id: 'editor-1', role: Role.EDITOR },
        { title: 'Story', content: 'A complete article body' },
      ),
    ).rejects.toThrow('audit unavailable');
  });

  it('never exposes a draft through public ID or slug reads', async () => {
    const service = blogs({
      blog: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'blog-1',
          status: BlogStatus.DRAFT,
        }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    });
    await expect(service.getPublishedBySlug('draft')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.getPublishedById('blog-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('queues a Cloudinary deletion failure idempotently', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const service = new MediaCleanupService(
      { mediaCleanupJob: { upsert } } as never,
      {
        delete: jest.fn().mockRejectedValue(new Error('provider down')),
      } as never,
    );
    await service.deleteOrEnqueue('asset-1');
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { publicId: 'asset-1' } }),
    );
  });

  it('allows only one of two simultaneous publish claims', async () => {
    let claims = 0;
    const current = {
      id: 'blog-1',
      status: BlogStatus.READY_FOR_ADMIN,
      revision: 7,
      approvedRevision: 7,
      approvedAt: new Date(),
      approvedById: 'admin-1',
      content: '<p>Approved article</p>',
      submissionId: null,
    };
    const tx = {
      blog: {
        updateMany: jest
          .fn()
          .mockImplementation(() =>
            Promise.resolve({ count: claims++ === 0 ? 1 : 0 }),
          ),
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ ...current, status: BlogStatus.PUBLISHED }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new AdminService(
      {
        blog: { findUnique: jest.fn().mockResolvedValue(current) },
        $transaction: (callback: (client: typeof tx) => unknown) =>
          callback(tx),
      } as never,
      audit as never,
    );
    const results = await Promise.allSettled([
      service.publishBlog('admin-1', 'blog-1'),
      service.publishBlog('admin-1', 'blog-1'),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
  });

  it('publishes due scheduled articles independently', async () => {
    const current = {
      id: 'blog-1',
      status: BlogStatus.SCHEDULED,
      revision: 2,
      approvedRevision: 2,
      approvedAt: new Date(),
      approvedById: 'admin-1',
      content: '<p>Scheduled article</p>',
      submissionId: null,
    };
    const tx = {
      blog: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ ...current, status: BlogStatus.PUBLISHED }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new AdminService(
      {
        blog: {
          findMany: jest.fn().mockResolvedValue([{ id: 'blog-1' }]),
          findUnique: jest.fn().mockResolvedValue(current),
        },
        $transaction: (callback: (client: typeof tx) => unknown) =>
          callback(tx),
      } as never,
      audit as never,
    );
    await expect(service.publishDue()).resolves.toMatchObject({
      processed: 1,
      published: 1,
      failed: 0,
    });
  });

  it('rejects an excessive public page limit', async () => {
    const dto = plainToInstance(BlogQueryDto, { page: 1, limit: 1000 });
    expect((await validate(dto)).map((error) => error.property)).toContain(
      'limit',
    );
  });

  it('configures endpoint-specific login throttling', () => {
    expect(
      Reflect.getMetadata(
        `${THROTTLER_LIMIT}default`,
        // eslint-disable-next-line @typescript-eslint/unbound-method
        AuthController.prototype.login,
      ),
    ).toBe(10);
  });

  it('forbids a user when an admin role is required', () => {
    const guard = new RolesGuard({
      getAllAndOverride: jest.fn().mockReturnValue([Role.ADMIN]),
    } as never);
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user: { role: Role.USER } }),
      }),
    };
    expect(guard.canActivate(context as never)).toBe(false);
  });
});
