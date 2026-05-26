{
    'name': 'Ultimate Project Gantt Pro',
    'version': '18.0.1.0.0',
    'summary': 'Advanced Gantt Chart for Project Management with Dependencies, Critical Path, and Auto-scheduling',
    'description': """
Ultimate Gantt Pro
==================
Providing professional-grade Gantt view features for Odoo Projects.
- Task Dependencies (FS, SS, FF, SF)
- Auto-scheduling Engine
- Critical Path Analysis
- Multi-baseline Ghosting
- Resource Load Histograms
- WBS Auto-numbering
- Multi-format Export (PDF, Excel, MSP, XML, JSON)
- Stock-aware integration for MRP
    """,
    'author': 'Antigravity / Custom Development',
    'category': 'Project',
    'depends': [
        'project',
        'hr',
        'mrp',
        'web',
        'web_gantt',
        'hr_timesheet',
    ],
    'data': [
        'security/ir.model.access.csv',
        'views/project_task_views.xml',
        'views/project_project_views.xml',
        'views/res_config_settings_views.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'cr_ultimate_gantt_pro/static/src/css/ultimate_gantt.css',
            'cr_ultimate_gantt_pro/static/src/js/ultimate_gantt_bundle.js',
            'cr_ultimate_gantt_pro/static/src/xml/ultimate_gantt_templates.xml',
        ],
    },
    'installable': True,
    'application': True,
    'license': 'OPL-1',
}
