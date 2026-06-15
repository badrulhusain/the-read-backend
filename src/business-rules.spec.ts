import {
  BadRequestException,
  ForbiddenException,
  ValidationPipe,
} from '@nestjs/common';
import { validate } from 'class-validator';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth/auth.service';
import { RegisterDto } from './auth/dto/register.dto';
import { BlogsService } from './blogs/blogs.service';
import { UpdateBlogDto } from './blogs/dto/update-blog.dto';
import { UpdateCoverImageDto } from './blogs/dto/cover-image.dto';
import { CreateCategoryDto } from './categories/dto/create-category.dto';
import { CreateTagDto } from './tags/dto/create-tag.dto';
import { DashboardService } from './dashboard/dashboard.service';
import { UsersService } from './users/users.service';
import { BlogStatus, Role, UserStatus } from './generated/prisma/client';

describe('business rules', () => {
  const audit = { log: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
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

    it('accepts 6-character passwords without composition rules', async () => {
      const errors = await validatePassword('abcdef');
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
        validationPipe.transform(
          { name: 'Longform', isActive: true },
          { type: 'body', metatype: CreateTagDto } as any,
        ),
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
      return new BlogsService(prisma as any, audit as any);
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

    it('accepts nested coverImage in blog update DTO', async () => {
      await expect(
        validationPipe.transform(
          {
            title: 'Valid title',
            seoTitle: 'SEO title',
            seoDescription: 'SEO description',
            categoryId: 'category-1',
            tagIds: ['tag-1', 'tag-2'],
            coverImage: {
              url: 'https://example.com/cover.jpg',
              publicId: 'covers/one',
              altText: 'Cover',
              crop: { x: 1, y: 2, width: 300, height: 200, zoom: 1.2 },
            },
          },
          { type: 'body', metatype: UpdateBlogDto } as any,
        ),
      ).resolves.toMatchObject({
        coverImage: {
          url: 'https://example.com/cover.jpg',
          publicId: 'covers/one',
        },
      });
    });

    it('accepts nested coverImage in cover image endpoint DTO', async () => {
      await expect(
        validationPipe.transform(
          {
            coverImage: {
              url: 'https://example.com/cover.jpg',
              publicId: 'covers/one',
              altText: 'Cover',
              crop: { x: 1, y: 2, width: 300, height: 200, zoom: 1.2 },
            },
          },
          { type: 'body', metatype: UpdateCoverImageDto } as any,
        ),
      ).resolves.toMatchObject({
        coverImage: { url: 'https://example.com/cover.jpg' },
      });
    });

    it('blocks authors from updating nested cover images through blog update', async () => {
      const service = createBlogsService({
        blog: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'blog-1',
            authorId: 'author-1',
            status: BlogStatus.DRAFT,
          }),
        },
      });

      await expect(
        service.update(
          'blog-1',
          { id: 'author-1', role: Role.AUTHOR },
          { coverImage: { url: 'https://example.com/cover.jpg' } },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it.each([Role.EDITOR, Role.ADMIN])(
      'allows %s to update cover image metadata',
      async (role) => {
        const update = jest.fn().mockResolvedValue({ id: 'blog-1' });
        const service = createBlogsService({
          blog: {
            findUnique: jest.fn().mockResolvedValue({ id: 'blog-1' }),
            update,
          },
        });

        await service.updateCoverImage(
          'blog-1',
          { id: 'staff-1', role },
          {
            coverImage: {
              url: 'https://example.com/cover.jpg',
              publicId: 'covers/one',
              altText: 'Cover',
              crop: { x: 1, y: 2, width: 300, height: 200, zoom: 1.2 },
            },
          },
        );

        expect(update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              coverImage: 'https://example.com/cover.jpg',
              coverImagePublicId: 'covers/one',
              coverImageAltText: 'Cover',
              coverImageUploadedById: 'staff-1',
              coverImageCrop: {
                x: 1,
                y: 2,
                width: 300,
                height: 200,
                zoom: 1.2,
              },
            }),
          }),
        );
      },
    );

    it('publishes submitted blogs', async () => {
      const update = jest
        .fn()
        .mockResolvedValue({ status: BlogStatus.PUBLISHED });
      const service = createBlogsService({
        blog: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'blog-1',
            status: BlogStatus.SUBMITTED,
            content: '<h3>Ready to publish</h3>',
          }),
          update,
        },
      });

      await service.publish('blog-1', { id: 'editor-1', role: Role.EDITOR });

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: BlogStatus.PUBLISHED }),
        }),
      );
    });

    it('unpublishes published blogs', async () => {
      const update = jest
        .fn()
        .mockResolvedValue({ status: BlogStatus.UNPUBLISHED });
      const service = createBlogsService({
        blog: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'blog-1',
            status: BlogStatus.PUBLISHED,
          }),
          update,
        },
      });

      await service.unpublish('blog-1', {
        id: 'editor-1',
        role: Role.EDITOR,
      });

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: BlogStatus.UNPUBLISHED },
        }),
      );
    });

    it('republishes unpublished blogs', async () => {
      const update = jest
        .fn()
        .mockResolvedValue({ status: BlogStatus.PUBLISHED });
      const service = createBlogsService({
        blog: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'blog-1',
            status: BlogStatus.UNPUBLISHED,
            content: '<p>Ready to republish</p>',
          }),
          update,
        },
      });

      await service.publish('blog-1', { id: 'editor-1', role: Role.EDITOR });

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: BlogStatus.PUBLISHED }),
        }),
      );
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
        submitted: 4,
        submittedBlogs: 4,
        underReview: 5,
        underReviewBlogs: 5,
        approved: 6,
        approvedBlogs: 6,
        published: 7,
        publishedBlogs: 7,
        rejected: 8,
        rejectedBlogs: 8,
      });
    });
  });
});
