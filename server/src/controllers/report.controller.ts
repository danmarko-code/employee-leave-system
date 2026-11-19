import type { Request, Response } from 'express';
import type { Pool } from 'mysql2/promise';
import type { ApplicationsReportQuery, SummaryReportQuery } from '@leave/shared';
import { unauthorized } from '../lib/errors';
import { currentYearUtc } from '../lib/dates';
import { normalizeIp } from '../lib/sanitize';
import { validQuery } from '../middleware/validate';
import {
  applicationsReport,
  applicationsReportCsv,
  auditReport,
  dashboardStats,
  leaveSummary,
} from '../services/report.service';

export function createReportController(deps: { pool: Pool }) {
  const { pool } = deps;

  return {
    summary: async (req: Request, res: Response): Promise<void> => {
      const auth = req.auth;
      if (!auth) throw unauthorized();
      const query = validQuery<SummaryReportQuery>(req);
      const report = await leaveSummary(pool, query, currentYearUtc());
      await auditReport(pool, auth.userId, 'leave_summary_report', normalizeIp(req.ip) ?? null);
      res.status(200).json(report);
    },

    applications: async (req: Request, res: Response): Promise<void> => {
      const auth = req.auth;
      if (!auth) throw unauthorized();
      const query = validQuery<ApplicationsReportQuery>(req);
      const rows = await applicationsReport(pool, query);
      await auditReport(
        pool,
        auth.userId,
        query.format === 'csv' ? 'applications_report_csv' : 'applications_report',
        normalizeIp(req.ip) ?? null
      );

      if (query.format === 'csv') {
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="leave-applications-${new Date().toISOString().slice(0, 10)}.csv"`
        );
        res.status(200).send(applicationsReportCsv(rows));
        return;
      }

      res.status(200).json({ items: rows });
    },

    dashboard: async (_req: Request, res: Response): Promise<void> => {
      res.status(200).json(await dashboardStats(pool));
    },
  };
}
