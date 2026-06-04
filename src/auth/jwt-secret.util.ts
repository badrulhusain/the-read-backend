import { ConfigService } from '@nestjs/config';

export function getJwtAccessSecret(configService: ConfigService): string {
  const secret =
    configService.get<string>('JWT_ACCESS_SECRET') ??
    configService.get<string>('JWT_SECRET');

  if (!secret) {
    throw new Error('JWT_ACCESS_SECRET or JWT_SECRET must be set');
  }

  return secret;
}
