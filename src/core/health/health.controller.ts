import { Controller, Get, Query, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { DataSource } from 'typeorm';

const COOLDOWN_MS = 12 * 60 * 60 * 1000; // 12 horas entre pings reales a Supabase

@ApiTags('Health & Keep-Alive')
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);
  private lastPingAt = 0;
  private lastResult: Record<string, any> | null = null;

  constructor(private readonly dataSource: DataSource) {}

  @Get('keep-alive')
  @ApiOperation({
    summary: 'Endpoint público para UptimeRobot: mantiene activos Azure, PostgreSQL (SELECT 1) y Supabase sin gastar cuota',
  })
  @ApiQuery({ name: 'force', required: false, description: 'Si es true, fuerza el ping real ignorando el cooldown de 12 horas' })
  async keepAlive(@Query('force') force?: string): Promise<Record<string, any>> {
    const now = Date.now();
    const forcePing = force === 'true';

    if (!forcePing && this.lastPingAt > 0 && now - this.lastPingAt < COOLDOWN_MS) {
      const nextInSeconds = Math.max(0, Math.ceil((COOLDOWN_MS - (now - this.lastPingAt)) / 1000));
      return {
        status: 'ok',
        mode: 'cached',
        egress_protected: true,
        last_ping_at: new Date(this.lastPingAt).toISOString(),
        next_real_ping_in_seconds: nextInSeconds,
        last_result: this.lastResult,
      };
    }

    // 1. SELECT 1 ligero en PostgreSQL para evitar pausa por inactividad
    let dbStatus = 'ok';
    try {
      await this.dataSource.query('SELECT 1 AS alive');
    } catch (err: any) {
      dbStatus = `error: ${err?.message || 'unknown'}`;
      this.logger.warn(`[Keep-Alive] Fallo SELECT 1 en PostgreSQL: ${dbStatus}`);
    }

    // 2. Ping ultraligero (~100 bytes) al proyecto de Supabase configurado
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://icpxceybcqkmkjuahkam.supabase.co';
    const supabaseKey =
      process.env.VITE_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.SUPABASE_KEY ||
      process.env.SUPABASE_SECRET_KEY ||
      '';

    let supabaseHttpStatus: number | string = 'skipped';
    if (supabaseUrl) {
      try {
        const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/health`, {
          method: 'GET',
          headers: supabaseKey ? { apikey: supabaseKey } : {},
          signal: AbortSignal.timeout(8000),
        });
        supabaseHttpStatus = res.status;
      } catch (err: any) {
        supabaseHttpStatus = `error: ${err?.message || 'timeout'}`;
        this.logger.warn(`[Keep-Alive] Fallo ping Supabase: ${supabaseHttpStatus}`);
      }
    }

    this.lastPingAt = now;
    this.lastResult = {
      db_select_1: dbStatus,
      supabase_auth_health: supabaseHttpStatus,
      supabase_url: supabaseUrl,
      timestamp: new Date(now).toISOString(),
    };

    return {
      status: 'ok',
      mode: 'live_ping',
      ...this.lastResult,
    };
  }
}
