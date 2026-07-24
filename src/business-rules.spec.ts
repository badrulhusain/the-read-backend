import {
  BadRequestException,
  ConflictException,
  ValidationPipe,
} from '@nestjs/common';
import { validate } from 'class-validator';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth/auth.service';
import { RegisterDto } from './auth/dto/register.dto';
import { BlogsService } from './blogs/blogs.service';
import { UpdateBlogDto } from './blogs/dto/update-blog.dto';
import { UploadThumbnailDto } from './blogs/dto/workflow.dto';
import { CriticalEvaluationDto } from './editorial/dto/critical-evaluation.dto';
import { CreateCategoryDto } from './categories/dto/create-category.dto';
import { CreateTagDto } from './tags/dto/create-tag.dto';
import { DashboardService } from './dashboard/dashboard.service';
import { UsersService } from './users/users.service';
import { BlogStatus, Role, UserStatus } from './generated/prisma/client';
import {
  ContributorDto,
  CreateSubmissionDto,
  ReviewSubmissionDto,
} from './submissions/dto/submission.dto';

describe('business rules', () => {
  const audit = { log: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('curated editorial workflow validation', () => {
    it('has exactly USER, EDITOR and ADMIN roles', () => {
      expect(Object.values(Role)).toEqual(['USER', 'EDITOR', 'ADMIN']);
    });

    it('accepts an external contributor submission without a user id', async () => {
      const dto = Object.assign(new CreateSubmissionDto(), {
        contributor: Object.assign(new ContributorDto(), {
          name: 'External Writer',
          email: 'writer@example.com',
        }),
        title: 'A carefully reported story',
        content: '<p>Draft story</p>',
      });
      expect(await validate(dto)).toHaveLength(0);
      expect(dto).not.toHaveProperty('userId');
    });

    it('requires structured fact and checklist data for editorial approval', async () => {
      const dto = Object.assign(new ReviewSubmissionDto(), {
        decision: 'READY_FOR_ADMIN',
      });
      const errors = await validate(dto);
      expect(errors.map((error) => error.property)).toEqual(
        expect.arrayContaining(['factCheckStatus', 'checklist']),
      );
    });
  });

  describe('password validation', () => {
    async function validatePassword(password: string) {
      const dto = new RegisterDto();
      dto.name = 'Reader';
      dto.email = 'reader@example.com';
      dto.password = password;
      return validate(dto);
    }

    it('rejects passwords shorter than 6 characters', async () => {
      const errors = await validatePassword('abcde');
      expect(errors.some((error) => error.property === 'password')).toBe(true);
    });

    it('rejects legacy 6-character passwords', async () => {
      const errors = await validatePassword('abcdef');
      expect(errors.some((error) => error.property === 'password')).toBe(true);
    });

    it('accepts passwords of at least 12 characters', async () => {
      const errors = await validatePassword('correct-horse');
      expect(errors).toHaveLength(0);
    });
  });

  describe('taxonomy create DTO validation', () => {
    const validationPipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    });

    it('accepts isActive when creating a category from the admin UI', async () => {
      await expect(
        validationPipe.transform(
          {
            name: 'Culture',
            description: 'Books and essays',
            isActive: true,
          },
          { type: 'body', metatype: CreateCategoryDto } as any,
        ),
      ).resolves.toMatchObject({ name: 'Culture', isActive: true });
    });

    it('accepts isActive when creating a tag from the admin UI', async () => {
      await expect(
        validationPipe.transform({ name: 'Longform', isActive: true }, {
          type: 'body',
          metatype: CreateTagDto,
        } as any),
      ).resolves.toMatchObject({ name: 'Longform', isActive: true });
    });
  });

  describe('blog cover and publishing rules', () => {
    const validationPipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    });

    function createBlogsService(prisma: Record<string, any>) {
      return new BlogsService(
        prisma as any,
        audit as any,
        {} as any,
        {} as any,
      );
    }

    it('rejects old flat cover image fields in blog update DTO', async () => {
      await expect(
        validationPipe.transform(
          {
            title: 'Valid title',
            coverImagePublicId: 'old-public-id',
            imageUrl: 'https://example.com/cover.jpg',
            altText: 'Old alt',
            coverImageAltText: 'Old alt',
            crop: { x: 1 },
          },
          { type: 'body', metatype: UpdateBlogDto } as any,
        ),
      ).rejects.toMatchObject({
        response: {
          message: expect.arrayContaining([
            expect.stringContaining('coverImagePublicId should not exist'),
            expect.stringContaining('imageUrl should not exist'),
            expect.stringContaining('altText should not exist'),
            expect.stringContaining('coverImageAltText should not exist'),
            expect.stringContaining('crop should not exist'),
          ]),
        },
      });
    });

    it('rejects URL-based cover image writes', async () => {
      await expect(
        validationPipe.transform(
          {
            title: 'Valid title',
            coverImage: { url: 'https://example.com/a.jpg' },
          },
          { type: 'body', metatype: UpdateBlogDto } as any,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('requires accessible alt text for thumbnail uploads', async () => {
      const dto = Object.assign(new UploadThumbnailDto(), {});
      expect((await validate(dto)).map((error) => error.property)).toContain(
        'altText',
      );
    });

    it('requires the complete critical evaluation scorecard', async () => {
      const dto = Object.assign(new CriticalEvaluationDto(), {
        contentQualityScore: 85,
      });
      const properties = (await validate(dto)).map((error) => error.property);
      expect(properties).toEqual(
        expect.arrayContaining([
          'grammarStatus',
          'readabilityScore',
          'factCheckStatus',
          'recommendation',
          'finalChecklist',
        ]),
      );
    });

    it('stores blank optional draft foreign keys as null', async () => {
      let createInput: unknown;
      const create = jest.fn((input: unknown) => {
        createInput = input;
        return Promise.resolve({ id: 'blog-1' });
      });
      const findCategory = jest.fn();
      const transactionClient = {
        blog: { create },
        auditLog: { create: jest.fn().mockResolvedValue({}) },
      };
      const transaction = jest.fn(
        (callback: (tx: typeof transactionClient) => Promise<unknown>) =>
          callback(transactionClient),
      );
      const service = createBlogsService({
        category: { findUnique: findCategory },
        blog: { findMany: jest.fn().mockResolvedValue([]) },
        $transaction: transaction,
      });

      await service.createDraft(
        { id: 'editor-1', role: Role.EDITOR },
        { categoryId: '', contributorId: '   ' },
      );

      expect(findCategory).not.toHaveBeenCalled();
      expect(createInput).toMatchObject({
        data: { categoryId: null, contributorId: null },
      });
    });

    it('allows admins to publish READY_FOR_ADMIN blogs', async () => {
      const updateMany = jest.fn().mockResolvedValue({ count: 1 });
      const tx = {
        blog: {
          updateMany,
          findUniqueOrThrow: jest
            .fn()
            .mockResolvedValue({ status: BlogStatus.PUBLISHED }),
        },
        auditLog: { create: jest.fn().mockResolvedValue({}) },
      };
      const service = createBlogsService({
        blog: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'blog-1',
            status: BlogStatus.READY_FOR_ADMIN,
            revision: 1,
            approvedRevision: 1,
            approvedAt: new Date(),
            approvedById: 'admin-1',
            content: '<h3>Ready to publish</h3>',
          }),
        },
        $transaction: (callback: (client: typeof tx) => unknown) =>
          callback(tx),
      });

      await service.publish('blog-1', { id: 'admin-1', role: Role.ADMIN });

      expect(updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: BlogStatus.PUBLISHED }),
        }),
      );
    });

    it('unpublishes published blogs', async () => {
      const updateMany = jest.fn().mockResolvedValue({ count: 1 });
      const tx = {
        blog: {
          updateMany,
          findUniqueOrThrow: jest
            .fn()
            .mockResolvedValue({ status: BlogStatus.UNPUBLISHED }),
        },
        auditLog: { create: jest.fn().mockResolvedValue({}) },
      };
      const service = createBlogsService({
        blog: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'blog-1',
            status: BlogStatus.PUBLISHED,
            revision: 1,
          }),
        },
        $transaction: (callback: (client: typeof tx) => unknown) =>
          callback(tx),
      });

      await service.unpublish('blog-1', {
        id: 'admin-1',
        role: Role.ADMIN,
      });

      expect(updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: BlogStatus.UNPUBLISHED }),
        }),
      );
    });

    it('does not publish UNPUBLISHED blogs without a new approval', async () => {
      const service = createBlogsService({
        blog: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'blog-1',
            status: BlogStatus.UNPUBLISHED,
            content: '<p>Ready to republish</p>',
          }),
          update: jest.fn(),
        },
      });

      await expect(
        service.publish('blog-1', { id: 'admin-1', role: Role.ADMIN }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('user deletion and deleted login rules', () => {
    it('soft deletes a normal user', async () => {
      const update = jest.fn().mockResolvedValue({
        id: 'user-1',
        status: UserStatus.DELETED,
        isDeleted: true,
      });
      const service = new UsersService(
        {
          user: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'user-1',
              role: Role.USER,
              status: UserStatus.ACTIVE,
              isDeleted: false,
            }),
            update,
          },
        } as any,
        audit as any,
      );

      await service.deleteUser('admin-1', 'user-1');

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: UserStatus.DELETED,
            isDeleted: true,
          }),
        }),
      );
    });

    it('blocks admin self-delete', async () => {
      const service = new UsersService({} as any, audit as any);

      await expect(
        service.deleteUser('admin-1', 'admin-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('blocks deleting the last admin', async () => {
      const service = new UsersService(
        {
          user: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'admin-2',
              role: Role.ADMIN,
              status: UserStatus.ACTIVE,
              isDeleted: false,
            }),
            count: jest.fn().mockResolvedValue(1),
          },
        } as any,
        audit as any,
      );

      await expect(
        service.deleteUser('admin-1', 'admin-2'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('blocks deleted users from login', async () => {
      const passwordHash = await bcrypt.hash('abcdef', 4);
      const service = new AuthService(
        {
          user: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'user-1',
              email: 'user@example.com',
              role: Role.USER,
              status: UserStatus.DELETED,
              isDeleted: true,
              passwordHash,
            }),
          },
        } as any,
        { sign: jest.fn() } as any,
      );

      await expect(
        service.login({ email: 'user@example.com', password: 'abcdef' }),
      ).rejects.toThrow('Account has been deleted');
    });
  });

  describe('admin dashboard stats', () => {
    it('returns frontend-compatible blog status aliases', async () => {
      const counts = [11, 2, 1, 3, 9, 4, 5, 6, 7, 8];
      const service = new DashboardService({
        user: {
          count: jest
            .fn()
            .mockImplementation(() => Promise.resolve(counts.shift())),
        },
        blog: {
          count: jest
            .fn()
            .mockImplementation(() => Promise.resolve(counts.shift())),
          findMany: jest.fn().mockResolvedValue([]),
        },
        auditLog: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      } as any);

      const dashboard = await service.getAdminDashboard();

      expect(dashboard.stats).toMatchObject({
        users: 11,
        totalUsers: 11,
        submitted: 9,
        submittedBlogs: 9,
        underReview: 4,
        underReviewBlogs: 4,
        approved: 5,
        approvedBlogs: 5,
        published: 6,
        publishedBlogs: 6,
        rejected: 7,
        rejectedBlogs: 7,
      });
    });
  });
});
