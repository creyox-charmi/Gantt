from odoo import models, fields, api, _

class ProjectTask(models.Model):
    _inherit = 'project.task'

    # Baseline fields (Ghosting)
    baseline_start_date = fields.Datetime("Baseline Start Date")
    baseline_end_date = fields.Datetime("Baseline End Date")
    baseline_duration = fields.Float("Baseline Duration", compute="_compute_baseline_duration", store=True)
    
    # Advanced Progress & Effort
    actual_progress = fields.Float("Actual Progress (%)", group_operator="avg")
    effort = fields.Float("Effort (Hours)")
    actual_effort = fields.Float("Actual Effort")
    baseline_effort = fields.Float("Baseline Effort")
    duration_variance = fields.Float("Duration Variance")
    start_variance = fields.Float("Start Variance")
    finish_variance = fields.Float("Finish Variance")
    cost = fields.Float("Cost")
    complexity = fields.Selection([
        ('impossible', 'Impossible'),
        ('hard', 'Hard'),
        ('normal', 'Normal'),
        ('easy', 'Easy')
    ], string="Complexity", default='normal')
    
    # Scheduling Engine Data
    scheduling_mode = fields.Selection([
        ('normal', 'Normal'),
        ('fixed_units', 'Fixed Units'),
        ('fixed_duration', 'Fixed Duration'),
        ('fixed_effort', 'Fixed Effort')
    ], string='Scheduling Mode', default='normal')
    
    constraint_type = fields.Selection([
        ('none', 'None'),
        ('asap', 'As soon as possible'),
        ('alap', 'As late as possible'),
        ('mso', 'Must start on'),
        ('mfo', 'Must finish on'),
        ('snet', 'Start no earlier than'),
        ('snlt', 'Start no later than'),
        ('fnet', 'Finish no earlier than'),
        ('fnlt', 'Finish no later than')
    ], string='Constraint Type', default='none')
    
    constraint_date = fields.Datetime("Constraint Date")
    manually_scheduled = fields.Boolean("Manually Scheduled", default=False)
    
    # Advanced Resource & Calendar Logic
    calendar_id = fields.Many2one('resource.calendar', string='Task Calendar')
    ignore_resource_calendar = fields.Boolean("Ignore Resource Calendar", default=False)
    effort_driven = fields.Boolean("Effort Driven", default=False)
    project_border = fields.Selection([
        ('ask', 'Ask User'),
        ('ignore', 'Ignore'),
        ('honor', 'Honor')
    ], string='Project Border', default='ask')

    # Visual & Control Flags
    rollup = fields.Boolean("Rollup", default=False)
    inactive = fields.Boolean("Inactive", default=False)
    is_milestone = fields.Boolean("Is Milestone", default=False)
    show_in_timeline = fields.Boolean("Show in Timeline", default=False)
    scheduling_direction = fields.Selection([('asap', 'As Soon As Possible'), ('alap', 'As Late As Possible')], string="Scheduling Direction", default='asap')
    info = fields.Char("Info")
    note = fields.Text("Note")
    early_start = fields.Datetime("Early Start")
    early_end = fields.Datetime("Early End")
    late_start = fields.Datetime("Late Start")
    late_end = fields.Datetime("Late End")
    total_slack = fields.Float("Total Slack")
    
    # Custom color for Gantt
    gantt_color = fields.Char("Gantt Color", default="#4285F4")
    
    # WBS Numbering
    wbs_number = fields.Char("WBS Number", compute="_compute_wbs_number", store=True)
    
    # Triple-stream Progress
    planned_progress = fields.Float("Planned Progress (%)", compute="_compute_planned_progress")
    timesheet_progress = fields.Float("Timesheet Progress (%)", related="progress")

    @api.depends('baseline_start_date', 'baseline_end_date')
    def _compute_baseline_duration(self):
        for task in self:
            if task.baseline_start_date and task.baseline_end_date:
                task.baseline_duration = (task.baseline_end_date - task.baseline_start_date).total_seconds() / 86400.0
            else:
                task.baseline_duration = 0.0

    @api.depends('planned_date_begin', 'date_deadline')
    def _compute_planned_progress(self):
        now = fields.Datetime.now()
        for task in self:
            if not task.planned_date_begin or not task.date_deadline:
                task.planned_progress = 0
                continue
            if now >= task.date_deadline:
                task.planned_progress = 100
            elif now <= task.planned_date_begin:
                task.planned_progress = 0
            else:
                total_duration = (task.date_deadline - task.planned_date_begin).total_seconds()
                elapsed = (now - task.planned_date_begin).total_seconds()
                task.planned_progress = (elapsed / total_duration) * 100

    @api.depends('parent_id', 'project_id', 'sequence')
    def _compute_wbs_number(self):
        for task in self:
            # Simple WBS logic: Project-Sequence
            prefix = task.project_id.name[:3].upper() if task.project_id else "TASK"
            task.wbs_number = f"{prefix}-{task.id}"

    def action_set_baseline(self):
        """Copies current planned dates to baseline."""
        for task in self:
            task.write({
                'baseline_start_date': task.planned_date_begin,
                'baseline_end_date': task.date_deadline,
            })

    @api.model
    def action_batch_update_gantt_dates(self, vals_list):
        """
        Updates dates for multiple tasks in a single call.
        vals_list: list of dicts [{'id': id, 'planned_date_begin': ..., 'date_deadline': ...}, ...]
        """
        for vals in vals_list:
            task = self.browse(int(vals['id']))
            if task.exists():
                task.write({
                    'planned_date_begin': vals.get('planned_date_begin'),
                    'date_deadline': vals.get('date_deadline'),
                })
        return True

class ProjectTaskDependency(models.Model):
    _name = 'project.task.dependency'
    _description = 'Task Dependency with Type and Lag'

    task_id = fields.Many2one('project.task', string='Task', required=True, ondelete='cascade')
    depends_on_id = fields.Many2one('project.task', string='Depends On', required=True)
    dependency_type = fields.Selection([
        ('fs', 'Finish-to-Start'),
        ('ss', 'Start-to-Start'),
        ('ff', 'Finish-to-Finish'),
        ('sf', 'Start-to-Finish')
    ], string='Type', default='fs', required=True)
    lag = fields.Float('Lag (Days)', default=0.0)

    _sql_constraints = [
        ('dependency_unique', 'unique(task_id, depends_on_id)', 'Dependency already exists!')
    ]

class ProjectGanttVersion(models.Model):
    _name = 'project.gantt.version'
    _description = 'Project Gantt Schedule Version'
    _order = 'date_saved desc'

    name = fields.Char("Version Name", required=True)
    project_id = fields.Many2one('project.project', string='Project', required=True, ondelete='cascade')
    date_saved = fields.Datetime("Date Saved", default=fields.Datetime.now, readonly=True)
    snapshot_data = fields.Text("Snapshot Data (JSON)", required=True)
    task_count = fields.Integer("Task Count")

    def action_restore(self):
        """Restores all tasks in the project to the dates in this snapshot."""
        import json
        data = json.loads(self.snapshot_data)
        for t_id, dates in data.items():
            task = self.env['project.task'].browse(int(t_id))
            if task.exists():
                task.write({
                    'planned_date_begin': dates.get('s'),
                    'date_deadline': dates.get('e'),
                })
        return True

class Project(models.Model):
    _inherit = 'project.project'

    baseline_start_date = fields.Datetime("Baseline Start Date")
    baseline_end_date = fields.Datetime("Baseline End Date")
    cost = fields.Float("Cost")
    complexity = fields.Selection([
        ('impossible', 'Impossible'),
        ('hard', 'Hard'),
        ('normal', 'Normal'),
        ('easy', 'Easy')
    ], string="Complexity", default='normal')

    def action_set_baseline(self):
        """Copies current project planned dates to baseline."""
        for project in self:
            project.write({
                'baseline_start_date': project.date_start,
                'baseline_end_date': project.date,
            })

    def action_save_gantt_version(self, name):
        import json
        tasks = self.env['project.task'].search([('project_id', '=', self.id)])
        snapshot = {}
        for t in tasks:
            if t.planned_date_begin and t.date_deadline:
                snapshot[t.id] = {
                    's': t.planned_date_begin.strftime('%Y-%m-%d %H:%M:%S'),
                    'e': t.date_deadline.strftime('%Y-%m-%d %H:%M:%S'),
                }
        self.env['project.gantt.version'].create({
            'name': name,
            'project_id': self.id,
            'snapshot_data': json.dumps(snapshot),
            'task_count': len(tasks)
        })
        return True
