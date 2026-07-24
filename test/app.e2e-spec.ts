import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';

describe('application (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    const reflector = app.get(Reflector);
    app.useGlobalGuards(new JwtAuthGuard(reflector), new RolesGuard(reflector));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/health (GET)', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);
    expect(response.body).toMatchObject({ status: 'ok' });
  });

  it('rejects an unauthenticated admin operation', async () => {
    await request(app.getHttpServer()).get('/admin/stats').expect(401);
  });
});

describe('security controls (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }])],
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            login: jest.fn().mockResolvedValue({ access_token: 'test' }),
            register: jest.fn(),
            getProfile: jest.fn(),
          },
        },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
      ],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('forbids unknown login properties', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'reader@example.com',
        password: 'abcdef',
        role: 'ADMIN',
      })
      .expect(400);
  });

  it('rate limits login attempts', async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'reader@example.com', password: 'abcdef' })
        .expect(200);
    }
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'reader@example.com', password: 'abcdef' })
      .expect(429);
  });
});
