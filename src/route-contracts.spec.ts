import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { AdminController } from './admin/admin.controller';
import { EditorialController } from './editorial/editorial.controller';
import { BlogsController } from './blogs/blogs.controller';
import { CommentsController } from './comments/comments.controller';
import { DiscoveryController } from './discovery/discovery.controller';
import { ReaderApiController } from './reader/reader-api.controller';
import { ReaderController } from './reader/reader.controller';

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

  it('exposes the editorial article routes used by the current workspace', () => {
    expect(routeMetadata(EditorialController.prototype, 'listMyWork')).toEqual({
      method: RequestMethod.GET,
      path: 'articles/my-work',
    });
    expect(routeMetadata(EditorialController.prototype, 'createDraft')).toEqual(
      { method: RequestMethod.POST, path: 'articles' },
    );
    expect(
      routeMetadata(EditorialController.prototype, 'autosaveDraft'),
    ).toEqual({ method: RequestMethod.PATCH, path: 'articles/:id/autosave' });
    expect(
      routeMetadata(EditorialController.prototype, 'evaluateArticleAlias'),
    ).toEqual({ method: RequestMethod.PUT, path: 'articles/:id/evaluation' });
    expect(
      routeMetadata(EditorialController.prototype, 'completeQualityReview'),
    ).toEqual({
      method: RequestMethod.POST,
      path: 'articles/:id/quality-review/complete',
    });
    expect(
      routeMetadata(EditorialController.prototype, 'sendArticleToAdminAlias'),
    ).toEqual({
      method: RequestMethod.POST,
      path: 'articles/:id/send-to-admin',
    });
  });

  it('keeps editorial decisions and cover-image editing registered', () => {
    expect(routeMetadata(EditorialController.prototype, 'approve')).toEqual({
      method: RequestMethod.POST,
      path: 'blogs/:id/approve',
    });
    expect(routeMetadata(EditorialController.prototype, 'reject')).toEqual({
      method: RequestMethod.POST,
      path: 'blogs/:id/reject',
    });
    expect(
      routeMetadata(EditorialController.prototype, 'requestRevision'),
    ).toEqual({
      method: RequestMethod.POST,
      path: 'blogs/:id/request-revision',
    });
    expect(
      routeMetadata(BlogsController.prototype, 'updateCoverImage'),
    ).toEqual({ method: RequestMethod.PATCH, path: ':id/cover-image' });
  });

  it('exposes publication queue and final article review routes', () => {
    expect(
      routeMetadata(AdminController.prototype, 'publicationQueue'),
    ).toEqual({ method: RequestMethod.GET, path: 'publication-queue' });
    expect(routeMetadata(AdminController.prototype, 'getArticle')).toEqual({
      method: RequestMethod.GET,
      path: 'articles/:id',
    });
    expect(routeMetadata(AdminController.prototype, 'returnToEditor')).toEqual({
      method: RequestMethod.POST,
      path: 'blogs/:id/return-to-editor',
    });
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

  it('exposes public discovery routes used by the landing pages', () => {
    expect(routeMetadata(BlogsController.prototype, 'featured')).toEqual({
      method: RequestMethod.GET,
      path: 'featured',
    });
    expect(routeMetadata(BlogsController.prototype, 'trending')).toEqual({
      method: RequestMethod.GET,
      path: 'trending',
    });
    expect(
      routeMetadata(BlogsController.prototype, 'getPublishedById'),
    ).toEqual({ method: RequestMethod.GET, path: 'id/:id' });
    expect(routeMetadata(DiscoveryController.prototype, 'listSeries')).toEqual({
      method: RequestMethod.GET,
      path: 'series',
    });
    expect(
      routeMetadata(DiscoveryController.prototype, 'listContributors'),
    ).toEqual({ method: RequestMethod.GET, path: 'contributors' });
  });

  it('exposes reader history, reactions, newsletter, and comment editing', () => {
    expect(routeMetadata(ReaderController.prototype, 'history')).toEqual({
      method: RequestMethod.GET,
      path: 'history',
    });
    expect(routeMetadata(ReaderController.prototype, 'recordHistory')).toEqual({
      method: RequestMethod.POST,
      path: 'history/:blogId',
    });
    expect(routeMetadata(ReaderApiController.prototype, 'react')).toEqual({
      method: RequestMethod.POST,
      path: 'blogs/:blogId/reactions',
    });
    expect(routeMetadata(ReaderApiController.prototype, 'subscribe')).toEqual({
      method: RequestMethod.POST,
      path: 'newsletter/subscribe',
    });
    expect(routeMetadata(CommentsController.prototype, 'update')).toEqual({
      method: RequestMethod.PATCH,
      path: 'comments/:id',
    });
  });
});
