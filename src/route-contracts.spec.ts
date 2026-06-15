import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { AdminController } from './admin/admin.controller';
import { EditorialController } from './editorial/editorial.controller';

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

  it('exposes editorial publish actions where the editor UI calls them', () => {
    expect(routeMetadata(EditorialController.prototype, 'publish')).toEqual({
      method: RequestMethod.POST,
      path: 'blogs/:id/publish',
    });
    expect(routeMetadata(EditorialController.prototype, 'unpublish')).toEqual({
      method: RequestMethod.POST,
      path: 'blogs/:id/unpublish',
    });
  });

  it('exposes editorial review list aliases used as frontend fallbacks', () => {
    expect(routeMetadata(EditorialController.prototype, 'listMyReviews')).toEqual(
      {
        method: RequestMethod.GET,
        path: 'my-reviews',
      },
    );
    expect(routeMetadata(EditorialController.prototype, 'listReviews')).toEqual(
      {
        method: RequestMethod.GET,
        path: 'reviews',
      },
    );
  });
});
