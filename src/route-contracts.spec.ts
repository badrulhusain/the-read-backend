import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { AdminController } from './admin/admin.controller';
import { EditorialController } from './editorial/editorial.controller';
import { BlogsController } from './blogs/blogs.controller';

function routeMetadata(
  controller: object,
  methodName: string,
): { method: RequestMethod; path: string } {
  const handler = controller[methodName as keyof typeof controller];

  return {
    method: Reflect.getMetadata(METHOD_METADATA, handler),
    path: Reflect.getMetadata(PATH_METADATA, handler),
  };
}

describe('frontend route contracts', () => {
  it('exposes admin user deletion where the admin UI calls it', () => {
    expect(routeMetadata(AdminController.prototype, 'deleteUser')).toEqual({
      method: RequestMethod.DELETE,
      path: 'users/:id',
    });
  });

  it('exposes publication actions only on the admin controller', () => {
    expect(routeMetadata(AdminController.prototype, 'publishBlog')).toEqual({
      method: RequestMethod.POST,
      path: 'blogs/:id/publish',
    });
    expect(routeMetadata(AdminController.prototype, 'unpublishBlog')).toEqual({
      method: RequestMethod.POST,
      path: 'blogs/:id/unpublish',
    });
  });

  it('exposes editorial review list aliases used as frontend fallbacks', () => {
    expect(
      routeMetadata(EditorialController.prototype, 'listMyReviews'),
    ).toEqual({
      method: RequestMethod.GET,
      path: 'my-reviews',
    });
    expect(routeMetadata(EditorialController.prototype, 'listReviews')).toEqual(
      {
        method: RequestMethod.GET,
        path: 'reviews',
      },
    );
  });

  it('exposes draft, autosave, preview and thumbnail workflow routes', () => {
    expect(routeMetadata(BlogsController.prototype, 'createDraft')).toEqual({
      method: RequestMethod.POST,
      path: 'drafts',
    });
    expect(routeMetadata(BlogsController.prototype, 'autosave')).toEqual({
      method: RequestMethod.PATCH,
      path: ':id/autosave',
    });
    expect(routeMetadata(BlogsController.prototype, 'preview')).toEqual({
      method: RequestMethod.GET,
      path: ':id/preview',
    });
    expect(routeMetadata(BlogsController.prototype, 'uploadThumbnail')).toEqual(
      { method: RequestMethod.POST, path: ':id/thumbnail' },
    );
  });

  it('exposes critical evaluation and admin handoff routes', () => {
    expect(routeMetadata(EditorialController.prototype, 'evaluate')).toEqual({
      method: RequestMethod.POST,
      path: 'blogs/:id/evaluation',
    });
    expect(routeMetadata(EditorialController.prototype, 'sendToAdmin')).toEqual(
      { method: RequestMethod.POST, path: 'blogs/:id/send-to-admin' },
    );
    expect(routeMetadata(AdminController.prototype, 'approveBlog')).toEqual({
      method: RequestMethod.POST,
      path: 'blogs/:id/approve',
    });
  });
});
