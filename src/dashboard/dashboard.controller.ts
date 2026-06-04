import { Controller, Get } from '@nestjs/common';
import { Role } from '../generated/prisma/client';
import { DashboardService } from './dashboard.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';

type RequestUser = { id: string; role: Role };

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Roles(Role.USER, Role.AUTHOR, Role.EDITOR, Role.ADMIN)
  @Get('user')
  getUserDashboard(@CurrentUser() user: RequestUser) {
    return this.dashboardService.getUserDashboard(user);
  }

  @Roles(Role.EDITOR, Role.ADMIN)
  @Get('editor')
  getEditorDashboard(@CurrentUser() user: RequestUser) {
    return this.dashboardService.getEditorDashboard(user);
  }

  @Roles(Role.ADMIN)
  @Get('admin')
  getAdminDashboard() {
    return this.dashboardService.getAdminDashboard();
  }
}
