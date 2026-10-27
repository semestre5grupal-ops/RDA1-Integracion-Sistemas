import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { TraceContextService } from './trace-context.service';

interface AuthenticatedRequest {
  user?: {
    id?: unknown;
    sub?: unknown;
    role?: unknown;
    roles?: unknown;
    app_metadata?: { role?: unknown };
    user_metadata?: { role?: unknown };
  };
}

@Injectable()
export class TraceContextInterceptor implements NestInterceptor {
  constructor(private readonly traceContext: TraceContextService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const current = this.traceContext.current();
    if (current && request.user) {
      const userId =
        typeof request.user.id === 'string'
          ? request.user.id
          : typeof request.user.sub === 'string'
            ? request.user.sub
            : undefined;
      const roles =
        request.user.roles ??
        request.user.role ??
        request.user.app_metadata?.role ??
        request.user.user_metadata?.role;
      const userRoles = Array.isArray(roles)
        ? roles.filter((role): role is string => typeof role === 'string')
        : typeof roles === 'string'
          ? [roles]
          : [];

      if (userId) current.userId = userId;
      if (userRoles.length) current.userRoles = userRoles;
    }

    return next.handle();
  }
}
