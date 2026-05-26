from odoo import api, fields, models


import logging
_logger = logging.getLogger(__name__)

class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    # Sidebar Column Visibility
    gantt_show_wbs = fields.Boolean(string='Show WBS Index Column')
    gantt_show_start_date = fields.Boolean(string='Show Start Date Column')
    gantt_show_duration = fields.Boolean(string='Show Duration Column')
    gantt_show_assignees = fields.Boolean(string='Show Assignees Column')
    gantt_show_cost = fields.Boolean(string='Show Cost Column')
    gantt_show_complexity = fields.Boolean(string='Show Complexity Column')
    gantt_show_constraint_date = fields.Boolean(string='Show Constraint Date Column')
    gantt_show_status = fields.Boolean(string='Show Status Column')
    gantt_show_deadline = fields.Boolean(string='Show Deadline Column')
    
    # Missing Original Columns
    gantt_show_progress = fields.Boolean(string='Show % Done Column')
    gantt_show_predecessors = fields.Boolean(string='Show Predecessors Column')
    gantt_show_successors = fields.Boolean(string='Show Successors Column')
    gantt_show_calendar = fields.Boolean(string='Show Calendar Column')
    gantt_show_constraint_type = fields.Boolean(string='Show Constraint Type Column')

    # New Bryntum Sidebar Columns
    gantt_show_actual_effort = fields.Boolean(string='Show Actual Effort Column')
    gantt_show_baseline_duration = fields.Boolean(string='Show Baseline Duration Column')
    gantt_show_baseline_effort = fields.Boolean(string='Show Baseline Effort Column')
    gantt_show_baseline_finish = fields.Boolean(string='Show Baseline Finish Column')
    gantt_show_baseline_start = fields.Boolean(string='Show Baseline Start Column')
    gantt_show_duration_variance = fields.Boolean(string='Show Duration Variance Column')
    gantt_show_early_end = fields.Boolean(string='Show Early End Column')
    gantt_show_early_start = fields.Boolean(string='Show Early Start Column')
    gantt_show_effort = fields.Boolean(string='Show Effort Column')
    gantt_show_finish = fields.Boolean(string='Show Finish Column')
    gantt_show_finish_variance = fields.Boolean(string='Show Finish Variance Column')
    gantt_show_ignore_resource_calendar = fields.Boolean(string='Show Ignore Resource Calendar Column')
    gantt_show_inactive = fields.Boolean(string='Show Inactive Column')
    gantt_show_info = fields.Boolean(string='Show Info Column')
    gantt_show_late_end = fields.Boolean(string='Show Late End Column')
    gantt_show_late_start = fields.Boolean(string='Show Late Start Column')
    gantt_show_manually_scheduled = fields.Boolean(string='Show Manually Scheduled Column')
    gantt_show_milestone = fields.Boolean(string='Show Milestone Column')
    gantt_show_note = fields.Boolean(string='Show Note Column')
    gantt_show_planned_percent_done = fields.Boolean(string='Show Planned % Done Column')
    gantt_show_rollup = fields.Boolean(string='Show Rollup Column')
    gantt_show_scheduling_direction = fields.Boolean(string='Show Scheduling Direction Column')
    gantt_show_show_in_timeline = fields.Boolean(string='Show in Timeline Column')
    gantt_show_start_variance = fields.Boolean(string='Show Start Variance Column')
    gantt_show_total_slack = fields.Boolean(string='Show Total Slack Column')

    # Tooltip Visibility
    gantt_tooltip_show_name = fields.Boolean(string='Tooltip: Show Name')
    gantt_tooltip_show_duration = fields.Boolean(string='Tooltip: Show Duration')
    gantt_tooltip_show_start = fields.Boolean(string='Tooltip: Show Start Date')
    gantt_tooltip_show_end = fields.Boolean(string='Tooltip: Show End Date')
    gantt_tooltip_show_progress = fields.Boolean(string='Tooltip: Show Progress')
    gantt_tooltip_show_deadline = fields.Boolean(string='Tooltip: Show Deadline')
    gantt_tooltip_show_stage = fields.Boolean(string='Tooltip: Show Stage')
    gantt_tooltip_show_constraint_type = fields.Boolean(string='Tooltip: Show Constraint Type')
    gantt_tooltip_show_constraint_date = fields.Boolean(string='Tooltip: Show Constraint Date')

    @api.model
    def get_gantt_config(self):
        """ Specialized method to fetch settings safely from JS without needing IDs """
        return self.create({}).get_values()

    def get_values(self):
        res = super(ResConfigSettings, self).get_values()
        params = self.env['ir.config_parameter'].sudo()
        res.update(
            gantt_show_wbs=params.get_param('cr_ultimate_gantt_pro.gantt_show_wbs', 'True') == 'True',
            gantt_show_start_date=params.get_param('cr_ultimate_gantt_pro.gantt_show_start_date', 'True') == 'True',
            gantt_show_duration=params.get_param('cr_ultimate_gantt_pro.gantt_show_duration', 'True') == 'True',
            gantt_show_assignees=params.get_param('cr_ultimate_gantt_pro.gantt_show_assignees', 'True') == 'True',
            gantt_show_cost=params.get_param('cr_ultimate_gantt_pro.gantt_show_cost', 'True') == 'True',
            gantt_show_complexity=params.get_param('cr_ultimate_gantt_pro.gantt_show_complexity', 'True') == 'True',
            gantt_show_constraint_date=params.get_param('cr_ultimate_gantt_pro.gantt_show_constraint_date', 'True') == 'True',
            gantt_show_status=params.get_param('cr_ultimate_gantt_pro.gantt_show_status', 'True') == 'True',
            gantt_show_deadline=params.get_param('cr_ultimate_gantt_pro.gantt_show_deadline', 'True') == 'True',
            gantt_show_progress=params.get_param('cr_ultimate_gantt_pro.gantt_show_progress', 'True') == 'True',
            gantt_show_predecessors=params.get_param('cr_ultimate_gantt_pro.gantt_show_predecessors', 'True') == 'True',
            gantt_show_successors=params.get_param('cr_ultimate_gantt_pro.gantt_show_successors', 'True') == 'True',
            gantt_show_calendar=params.get_param('cr_ultimate_gantt_pro.gantt_show_calendar', 'True') == 'True',
            gantt_show_constraint_type=params.get_param('cr_ultimate_gantt_pro.gantt_show_constraint_type', 'True') == 'True',

            gantt_show_actual_effort=params.get_param('cr_ultimate_gantt_pro.gantt_show_actual_effort', 'False') == 'True',
            gantt_show_baseline_duration=params.get_param('cr_ultimate_gantt_pro.gantt_show_baseline_duration', 'False') == 'True',
            gantt_show_baseline_effort=params.get_param('cr_ultimate_gantt_pro.gantt_show_baseline_effort', 'False') == 'True',
            gantt_show_baseline_finish=params.get_param('cr_ultimate_gantt_pro.gantt_show_baseline_finish', 'False') == 'True',
            gantt_show_baseline_start=params.get_param('cr_ultimate_gantt_pro.gantt_show_baseline_start', 'False') == 'True',
            gantt_show_duration_variance=params.get_param('cr_ultimate_gantt_pro.gantt_show_duration_variance', 'False') == 'True',
            gantt_show_early_end=params.get_param('cr_ultimate_gantt_pro.gantt_show_early_end', 'False') == 'True',
            gantt_show_early_start=params.get_param('cr_ultimate_gantt_pro.gantt_show_early_start', 'False') == 'True',
            gantt_show_effort=params.get_param('cr_ultimate_gantt_pro.gantt_show_effort', 'False') == 'True',
            gantt_show_finish=params.get_param('cr_ultimate_gantt_pro.gantt_show_finish', 'False') == 'True',
            gantt_show_finish_variance=params.get_param('cr_ultimate_gantt_pro.gantt_show_finish_variance', 'False') == 'True',
            gantt_show_ignore_resource_calendar=params.get_param('cr_ultimate_gantt_pro.gantt_show_ignore_resource_calendar', 'False') == 'True',
            gantt_show_inactive=params.get_param('cr_ultimate_gantt_pro.gantt_show_inactive', 'False') == 'True',
            gantt_show_info=params.get_param('cr_ultimate_gantt_pro.gantt_show_info', 'False') == 'True',
            gantt_show_late_end=params.get_param('cr_ultimate_gantt_pro.gantt_show_late_end', 'False') == 'True',
            gantt_show_late_start=params.get_param('cr_ultimate_gantt_pro.gantt_show_late_start', 'False') == 'True',
            gantt_show_manually_scheduled=params.get_param('cr_ultimate_gantt_pro.gantt_show_manually_scheduled', 'False') == 'True',
            gantt_show_milestone=params.get_param('cr_ultimate_gantt_pro.gantt_show_milestone', 'False') == 'True',
            gantt_show_note=params.get_param('cr_ultimate_gantt_pro.gantt_show_note', 'False') == 'True',
            gantt_show_planned_percent_done=params.get_param('cr_ultimate_gantt_pro.gantt_show_planned_percent_done', 'False') == 'True',
            gantt_show_rollup=params.get_param('cr_ultimate_gantt_pro.gantt_show_rollup', 'False') == 'True',
            gantt_show_scheduling_direction=params.get_param('cr_ultimate_gantt_pro.gantt_show_scheduling_direction', 'False') == 'True',
            gantt_show_show_in_timeline=params.get_param('cr_ultimate_gantt_pro.gantt_show_show_in_timeline', 'False') == 'True',
            gantt_show_start_variance=params.get_param('cr_ultimate_gantt_pro.gantt_show_start_variance', 'False') == 'True',
            gantt_show_total_slack=params.get_param('cr_ultimate_gantt_pro.gantt_show_total_slack', 'False') == 'True',

            gantt_tooltip_show_name=params.get_param('cr_ultimate_gantt_pro.gantt_tooltip_show_name', 'True') == 'True',
            gantt_tooltip_show_duration=params.get_param('cr_ultimate_gantt_pro.gantt_tooltip_show_duration', 'True') == 'True',
            gantt_tooltip_show_start=params.get_param('cr_ultimate_gantt_pro.gantt_tooltip_show_start', 'True') == 'True',
            gantt_tooltip_show_end=params.get_param('cr_ultimate_gantt_pro.gantt_tooltip_show_end', 'True') == 'True',
            gantt_tooltip_show_progress=params.get_param('cr_ultimate_gantt_pro.gantt_tooltip_show_progress', 'True') == 'True',
            gantt_tooltip_show_deadline=params.get_param('cr_ultimate_gantt_pro.gantt_tooltip_show_deadline', 'True') == 'True',
            gantt_tooltip_show_stage=params.get_param('cr_ultimate_gantt_pro.gantt_tooltip_show_stage', 'True') == 'True',
            gantt_tooltip_show_constraint_type=params.get_param('cr_ultimate_gantt_pro.gantt_tooltip_show_constraint_type', 'True') == 'True',
            gantt_tooltip_show_constraint_date=params.get_param('cr_ultimate_gantt_pro.gantt_tooltip_show_constraint_date', 'True') == 'True',
        )
        return res

    def set_values(self):
        super(ResConfigSettings, self).set_values()
        params = self.env['ir.config_parameter'].sudo()
        params.set_param('cr_ultimate_gantt_pro.gantt_show_wbs', str(self.gantt_show_wbs))
        params.set_param('cr_ultimate_gantt_pro.gantt_show_start_date', str(self.gantt_show_start_date))
        params.set_param('cr_ultimate_gantt_pro.gantt_show_duration', str(self.gantt_show_duration))
        params.set_param('cr_ultimate_gantt_pro.gantt_show_assignees', str(self.gantt_show_assignees))
        params.set_param('cr_ultimate_gantt_pro.gantt_show_cost', str(self.gantt_show_cost))
        params.set_param('cr_ultimate_gantt_pro.gantt_show_complexity', str(self.gantt_show_complexity))
        params.set_param('cr_ultimate_gantt_pro.gantt_show_constraint_date', str(self.gantt_show_constraint_date))
        params.set_param('cr_ultimate_gantt_pro.gantt_show_status', str(self.gantt_show_status))
        params.set_param('cr_ultimate_gantt_pro.gantt_show_deadline', str(self.gantt_show_deadline))
        params.set_param('cr_ultimate_gantt_pro.gantt_show_progress', str(self.gantt_show_progress))
        params.set_param('cr_ultimate_gantt_pro.gantt_show_predecessors', str(self.gantt_show_predecessors))
        params.set_param('cr_ultimate_gantt_pro.gantt_show_successors', str(self.gantt_show_successors))
        params.set_param('cr_ultimate_gantt_pro.gantt_show_calendar', str(self.gantt_show_calendar))
        params.set_param('cr_ultimate_gantt_pro.gantt_show_constraint_type', str(self.gantt_show_constraint_type))

        params.set_param('cr_ultimate_gantt_pro.gantt_show_actual_effort', str(self.gantt_show_actual_effort))
        params.set_param('cr_ultimate_gantt_pro.gantt_show_baseline_duration', str(self.gantt_show_baseline_duration))
        params.set_param('cr_ultimate_gantt_pro.gantt_show_baseline_effort', str(self.gantt_show_baseline_effort))
        params.set_param('cr_ultimate_gantt_pro.gantt_show_baseline_finish', str(self.gantt_show_baseline_finish))
        params.set_param('cr_ultimate_gantt_pro.gantt_show_baseline_start', str(self.gantt_show_baseline_start))
        params.set_param('cr_ultimate_gantt_pro.gantt_show_duration_variance', str(self.gantt_show_duration_variance))
        params.set_param('cr_ultimate_gantt_pro.gantt_show_early_end', str(self.gantt_show_early_end))
        params.set_param('cr_ultimate_gantt_pro.gantt_show_early_start', str(self.gantt_show_early_start))
        params.set_param('cr_ultimate_gantt_pro.gantt_show_effort', str(self.gantt_show_effort))
        params.set_param('cr_ultimate_gantt_pro.gantt_show_finish', str(self.gantt_show_finish))
        params.set_param('cr_ultimate_gantt_pro.gantt_show_finish_variance', str(self.gantt_show_finish_variance))
        params.set_param('cr_ultimate_gantt_pro.gantt_show_ignore_resource_calendar', str(self.gantt_show_ignore_resource_calendar))
        params.set_param('cr_ultimate_gantt_pro.gantt_show_inactive', str(self.gantt_show_inactive))
        params.set_param('cr_ultimate_gantt_pro.gantt_show_info', str(self.gantt_show_info))
        params.set_param('cr_ultimate_gantt_pro.gantt_show_late_end', str(self.gantt_show_late_end))
        params.set_param('cr_ultimate_gantt_pro.gantt_show_late_start', str(self.gantt_show_late_start))
        params.set_param('cr_ultimate_gantt_pro.gantt_show_manually_scheduled', str(self.gantt_show_manually_scheduled))
        params.set_param('cr_ultimate_gantt_pro.gantt_show_milestone', str(self.gantt_show_milestone))
        params.set_param('cr_ultimate_gantt_pro.gantt_show_note', str(self.gantt_show_note))
        params.set_param('cr_ultimate_gantt_pro.gantt_show_planned_percent_done', str(self.gantt_show_planned_percent_done))
        params.set_param('cr_ultimate_gantt_pro.gantt_show_rollup', str(self.gantt_show_rollup))
        params.set_param('cr_ultimate_gantt_pro.gantt_show_scheduling_direction', str(self.gantt_show_scheduling_direction))
        params.set_param('cr_ultimate_gantt_pro.gantt_show_show_in_timeline', str(self.gantt_show_show_in_timeline))
        params.set_param('cr_ultimate_gantt_pro.gantt_show_start_variance', str(self.gantt_show_start_variance))
        params.set_param('cr_ultimate_gantt_pro.gantt_show_total_slack', str(self.gantt_show_total_slack))

        params.set_param('cr_ultimate_gantt_pro.gantt_tooltip_show_name', str(self.gantt_tooltip_show_name))
        params.set_param('cr_ultimate_gantt_pro.gantt_tooltip_show_duration', str(self.gantt_tooltip_show_duration))
        params.set_param('cr_ultimate_gantt_pro.gantt_tooltip_show_start', str(self.gantt_tooltip_show_start))
        params.set_param('cr_ultimate_gantt_pro.gantt_tooltip_show_end', str(self.gantt_tooltip_show_end))
        params.set_param('cr_ultimate_gantt_pro.gantt_tooltip_show_progress', str(self.gantt_tooltip_show_progress))
        params.set_param('cr_ultimate_gantt_pro.gantt_tooltip_show_deadline', str(self.gantt_tooltip_show_deadline))
        params.set_param('cr_ultimate_gantt_pro.gantt_tooltip_show_stage', str(self.gantt_tooltip_show_stage))
        params.set_param('cr_ultimate_gantt_pro.gantt_tooltip_show_constraint_type', str(self.gantt_tooltip_show_constraint_type))
        params.set_param('cr_ultimate_gantt_pro.gantt_tooltip_show_constraint_date', str(self.gantt_tooltip_show_constraint_date))

        # --- EMERGENCY FIX FOR WINDOWS DLL BLOCK ---
        try:
            self.env.cr.execute("DROP EXTENSION IF EXISTS pg_trgm CASCADE")
            _logger.info("Ultimate Gantt Pro: Attempted to drop pg_trgm extension to bypass Windows DLL block.")
        except Exception as e:
            _logger.warning("Ultimate Gantt Pro: Could not drop pg_trgm (likely already gone or no permission): %s", e)
