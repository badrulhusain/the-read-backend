import { createParamDecorator, ExecutionContext } from '@nestjs/common';

interface AuthRequest {
  user: unknown;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) =>
    ctx.switchToHttp().getRequest<AuthRequest>().user,
);
