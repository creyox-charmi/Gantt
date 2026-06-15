from odoo import models, fields, api

class ProjectProject(models.Model):
    _inherit = 'project.project'

    ultimate_duration = fields.Char(string="Duration", compute="_compute_ultimate_duration", store=True)
    baseline_start_date = fields.Datetime("Baseline Start Date")
    baseline_end_date = fields.Datetime("Baseline End Date")
    inactive = fields.Boolean("Inactive", default=False)

    @api.depends('date_start', 'date')
    def _compute_ultimate_duration(self):
        for project in self:
            if project.date_start and project.date:
                delta = project.date - project.date_start
                days = delta.days
                if days > 0:
                    project.ultimate_duration = f"{days} day(s)"
                else:
                    project.ultimate_duration = "1 day"
            else:
                project.ultimate_duration = "-"

    def write(self, vals):
        res = super(ProjectProject, self).write(vals)
        if 'inactive' in vals:
            for project in self:
                tasks = self.env['project.task'].search([('project_id', '=', project.id), ('parent_id', '=', False)])
                if tasks:
                    tasks.write({'inactive': vals['inactive']})
        return res

    def action_set_baseline(self):
        for record in self:
            record.write({
                'baseline_start_date': record.date_start,
                'baseline_end_date': record.date
            })
