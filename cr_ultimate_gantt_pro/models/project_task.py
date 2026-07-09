from odoo import models, fields, api, _

class ProjectTask(models.Model):
    _inherit = 'project.task'

    # Baseline fields (Ghosting)
    baseline_start_date = fields.Datetime("Baseline Start Date")
    baseline_end_date = fields.Datetime("Baseline End Date")
    baseline_duration = fields.Float("Baseline Duration", compute="_compute_baseline_duration", store=True)
    
    baseline2_start_date = fields.Datetime("Baseline 2 Start Date")
    baseline2_end_date = fields.Datetime("Baseline 2 End Date")
    
    baseline3_start_date = fields.Datetime("Baseline 3 Start Date")
    baseline3_end_date = fields.Datetime("Baseline 3 End Date")
    
    # Advanced Progress & Effort
    actual_progress = fields.Float("Actual Progress (%)", group_operator="avg")
    effort = fields.Float("Effort (Hours)", compute="_compute_effort", inverse="_inverse_effort", store=True)

    @api.depends(lambda self: ['allocated_hours'] if hasattr(self.env['project.task'], 'allocated_hours') else [])
    def _compute_effort(self):
        for task in self:
            if hasattr(task, 'allocated_hours'):
                task.effort = task.allocated_hours
            else:
                task.effort = task.effort or 0.0

    def _inverse_effort(self):
        for task in self:
            if hasattr(task, 'allocated_hours'):
                task.allocated_hours = task.effort
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
    inactive_dependency_ids = fields.Many2many(
        'project.task',
        'project_task_inactive_dependencies_rel',
        'task_id',
        'inactive_dependency_id',
        string='Inactive Dependencies'
    )
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

    # Resource Assignments
    resource_assignment_ids = fields.One2many(
        'project.task.resource.assignment', 'task_id', string='Resource Assignments'
    )

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

    @api.onchange('allocated_hours', 'ignore_resource_calendar', 'calendar_id', 'planned_date_begin')
    def _onchange_sync_dates_from_hours(self):
        for task in self:
            if not getattr(task, 'planned_date_begin', False) or not hasattr(task, 'allocated_hours'):
                continue
                
            alloc = task.allocated_hours
            if not alloc:
                continue

            cal = task.calendar_id or task.project_id.resource_calendar_id or self.env.company.resource_calendar_id
            if not task.ignore_resource_calendar and cal:
                new_end = cal.plan_hours(alloc, task.planned_date_begin, compute_leaves=True)
                if new_end:
                    task.date_deadline = new_end
            else:
                from datetime import timedelta
                task.date_deadline = task.planned_date_begin + timedelta(hours=alloc)

    @api.onchange('date_deadline')
    def _onchange_sync_hours_from_dates(self):
        for task in self:
            if not getattr(task, 'planned_date_begin', False) or not getattr(task, 'date_deadline', False) or not hasattr(task, 'allocated_hours'):
                continue
                
            cal = task.calendar_id or task.project_id.resource_calendar_id or self.env.company.resource_calendar_id
            if not task.ignore_resource_calendar and cal:
                hours = cal.get_work_hours_count(task.planned_date_begin, task.date_deadline, compute_leaves=True)
                task.allocated_hours = hours
                task.effort = hours
            else:
                hours = (task.date_deadline - task.planned_date_begin).total_seconds() / 3600.0
                task.allocated_hours = hours
                task.effort = hours

    @api.model_create_multi
    def create(self, vals_list):
        tasks = super(ProjectTask, self).create(vals_list)
        if not self.env.context.get('skip_sync_dates_hours'):
            for task in tasks:
                if getattr(task, 'allocated_hours', False) and task.planned_date_begin and not task.date_deadline:
                    cal = task.calendar_id or task.project_id.resource_calendar_id or self.env.company.resource_calendar_id
                    if not task.ignore_resource_calendar and cal:
                        new_end = cal.plan_hours(task.allocated_hours, task.planned_date_begin, compute_leaves=True)
                        if new_end:
                            task.with_context(skip_sync_dates_hours=True).write({'date_deadline': new_end})
                    else:
                        from datetime import timedelta
                        new_end = task.planned_date_begin + timedelta(hours=task.allocated_hours)
                        task.with_context(skip_sync_dates_hours=True).write({'date_deadline': new_end})
        return tasks

    def write(self, vals):
        if self.env.context.get('skip_sync_dates_hours'):
            res = super(ProjectTask, self).write(vals)
            if 'inactive' in vals:
                for task in self:
                    children = self.env['project.task'].search([('parent_id', '=', task.id)])
                    if children:
                        children.write({'inactive': vals['inactive']})
            return res

        # Snapshot old state before writing to detect genuine changes
        old_state = {}
        for task in self:
            old_state[task.id] = {
                'allocated_hours': getattr(task, 'allocated_hours', 0.0),
                'effort': getattr(task, 'effort', 0.0),
                'ignore_resource_calendar': task.ignore_resource_calendar,
                'calendar_id': task.calendar_id.id if task.calendar_id else False,
                'planned_date_begin': task.planned_date_begin.strftime('%Y-%m-%d %H:%M:%S') if task.planned_date_begin else '',
                'date_deadline': task.date_deadline.strftime('%Y-%m-%d %H:%M:%S') if task.date_deadline else '',
            }

        res = super(ProjectTask, self).write(vals)

        if 'inactive' in vals:
            for task in self:
                children = self.env['project.task'].search([('parent_id', '=', task.id)])
                if children:
                    children.write({'inactive': vals['inactive']})

        # 2-Way Sync: allocated_hours <-> dates
        from datetime import timedelta
        for task in self:
            has_alloc = hasattr(task, 'allocated_hours')
            if not has_alloc:
                continue

            old = old_state.get(task.id, {})
            
            alloc_hours_new = False
            alloc_changed = False
            if 'allocated_hours' in vals and vals['allocated_hours'] != old.get('allocated_hours'):
                alloc_changed = True
                alloc_hours_new = vals['allocated_hours']
            elif 'effort' in vals and vals['effort'] != old.get('effort'):
                alloc_changed = True
                alloc_hours_new = vals['effort']

            ignore_changed = 'ignore_resource_calendar' in vals and vals['ignore_resource_calendar'] != old.get('ignore_resource_calendar')
            calendar_changed = 'calendar_id' in vals and vals.get('calendar_id') != old.get('calendar_id')
            
            p_begin_changed = False
            d_dead_changed = False
            if 'planned_date_begin' in vals and vals['planned_date_begin']:
                val_str = vals['planned_date_begin'] if isinstance(vals['planned_date_begin'], str) else vals['planned_date_begin'].strftime('%Y-%m-%d %H:%M:%S')
                if val_str != old.get('planned_date_begin'): p_begin_changed = True
            if 'date_deadline' in vals and vals['date_deadline']:
                val_str = vals['date_deadline'] if isinstance(vals['date_deadline'], str) else vals['date_deadline'].strftime('%Y-%m-%d %H:%M:%S')
                if val_str != old.get('date_deadline'): d_dead_changed = True
            dates_changed = p_begin_changed or d_dead_changed

            # Check Scheduling Modes & Effort Driven logic
            sync_dates_from_alloc = True
            sync_alloc_from_dates = True
            
            if task.effort_driven:
                mode = task.scheduling_mode or 'normal'
                if mode in ('normal', 'fixed_duration', 'fixed_effort'):
                    sync_dates_from_alloc = False
                    sync_alloc_from_dates = False
                elif mode == 'fixed_units':
                    sync_dates_from_alloc = True
                    sync_alloc_from_dates = True

            if alloc_changed and sync_dates_from_alloc:
                ignore = task.ignore_resource_calendar
                try:
                    with open(r'c:\Users\charm\Documents\odoo\odoo-18.0\gantt_debug.txt', 'a') as f:
                        f.write(f"alloc_changed! alloc_hours_new: {alloc_hours_new}, ignore: {ignore}, has start: {bool(task.planned_date_begin)}\n")
                except: pass
                
                if task.planned_date_begin:
                    cal = task.calendar_id or task.project_id.resource_calendar_id or self.env.company.resource_calendar_id
                    if not ignore and cal:
                        new_end = cal.plan_hours(alloc_hours_new, task.planned_date_begin, compute_leaves=True)
                        try:
                            with open(r'c:\Users\charm\Documents\odoo\odoo-18.0\gantt_debug.txt', 'a') as f:
                                f.write(f"cal.plan_hours result: {new_end}\n")
                        except: pass
                        if new_end:
                            task.with_context(skip_sync_dates_hours=True).write({'date_deadline': new_end})
                    else:
                        new_end = task.planned_date_begin + timedelta(hours=alloc_hours_new)
                        try:
                            with open(r'c:\Users\charm\Documents\odoo\odoo-18.0\gantt_debug.txt', 'a') as f:
                                f.write(f"24/7 result: {new_end}\n")
                        except: pass
                        task.with_context(skip_sync_dates_hours=True).write({'date_deadline': new_end})
            elif ignore_changed or calendar_changed:
                try:
                    with open(r'c:\Users\charm\Documents\odoo\odoo-18.0\gantt_debug.txt', 'a') as f:
                        f.write(f"ignore_changed! ignore: {ignore_changed}, cal: {calendar_changed}\n")
                except: pass
                if task.planned_date_begin and task.allocated_hours:
                    cal = task.calendar_id or task.project_id.resource_calendar_id or self.env.company.resource_calendar_id
                    ignore = task.ignore_resource_calendar
                    if not ignore and cal:
                        new_end = cal.plan_hours(task.allocated_hours, task.planned_date_begin, compute_leaves=True)
                        if new_end:
                            task.with_context(skip_sync_dates_hours=True).write({'date_deadline': new_end})
                    else:
                        new_end = task.planned_date_begin + timedelta(hours=task.allocated_hours)
                        task.with_context(skip_sync_dates_hours=True).write({'date_deadline': new_end})

            elif dates_changed and sync_alloc_from_dates:
                p_begin = task.planned_date_begin
                d_dead = task.date_deadline
                if p_begin and d_dead:
                    cal = task.calendar_id or task.project_id.resource_calendar_id or self.env.company.resource_calendar_id
                    ignore = task.ignore_resource_calendar
                    if not ignore and cal:
                        hours = cal.get_work_hours_count(p_begin, d_dead, compute_leaves=True)
                        task.with_context(skip_sync_dates_hours=True).write({'allocated_hours': hours, 'effort': hours})
                    else:
                        hours = (d_dead - p_begin).total_seconds() / 3600.0
                        task.with_context(skip_sync_dates_hours=True).write({'allocated_hours': hours, 'effort': hours})

        return res

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

class ProjectTaskResourceAssignment(models.Model):
    _name = 'project.task.resource.assignment'
    _description = 'Task Resource Assignment'

    task_id = fields.Many2one('project.task', string='Task', required=True, ondelete='cascade')
    resource_id = fields.Many2one('resource.resource', string='Resource', required=True, ondelete='cascade')
    units = fields.Float('Units / Quantity', default=100.0)
    cost = fields.Float('Cost')

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
    baseline2_start_date = fields.Datetime("Baseline 2 Start Date")
    baseline2_end_date = fields.Datetime("Baseline 2 End Date")
    baseline3_start_date = fields.Datetime("Baseline 3 Start Date")
    baseline3_end_date = fields.Datetime("Baseline 3 End Date")

    actual_progress = fields.Float("Actual Progress (%)")
    real_duration = fields.Float("Real Duration (Days)")
    calendar_id = fields.Many2one('resource.calendar', string='Project Calendar')
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
    scheduling_mode = fields.Selection([
        ('normal', 'Normal'),
        ('fixed_units', 'Fixed Units'),
        ('fixed_duration', 'Fixed Duration'),
        ('fixed_effort', 'Fixed Effort')
    ], string='Scheduling Mode', default='normal')

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
