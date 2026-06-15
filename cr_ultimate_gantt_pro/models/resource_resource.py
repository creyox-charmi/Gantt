from odoo import models, fields

class ResourceResource(models.Model):
    _inherit = 'resource.resource'

    resource_type = fields.Selection(
        selection_add=[('cost', 'Cost')],
        ondelete={'cost': 'set default'}
    )
    cost_rate = fields.Float('Cost / Rate', default=0.0)
    city = fields.Char('City')
    max_units = fields.Float('Max Units', default=100.0)
    accrue_at = fields.Selection([
        ('start', 'Start'),
        ('prorated', 'Prorated'),
        ('end', 'End')
    ], string='Accrue At', default='prorated')
    material_label = fields.Char('Material Label')
