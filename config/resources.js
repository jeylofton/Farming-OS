// Resource registry: every standard admin screen (list / form / detail / archive / delete) is generated
// from these definitions by controllers/resourceController.js and views/admin/resource/*.
// Add a table + an entry here to get a full module; never hand-code a page per crop, student or class.
//
// Field:  { name, label, type, required, options, ref, min, max, help, lockOnEdit, default, half }
//   types: text | textarea | number | integer | money | date | datetime | select | ref | checkbox | image | email | tel
// Column: { key, label, type, chip, link, cls }  (types: text | money | qty | date | datetime | chip | flag | number)
const U = {
  weight: ['lb', 'kg', 'oz', 'bunch', 'each', 'dozen', 'pint', 'quart', 'flat', 'bag'],
};
const opts = (list) => list.map((v) => [v, v]);

const STAGES = [['planned', 'Planned'], ['sown', 'Sown'], ['germinating', 'Germinating'], ['growing', 'Growing'], ['harvesting', 'Harvesting'], ['completed', 'Completed'], ['failed', 'Failed']];
const TASK_TYPES = ['Sowing', 'Watering', 'Fertilizing', 'Transplanting', 'Weeding', 'Pest control', 'Harvesting', 'Maintenance', 'Class prep', 'Other'];
const EXPENSE_CATEGORIES = ['Seeds', 'Soil & amendments', 'Labor', 'Equipment', 'Utilities', 'Packaging', 'Marketing', 'Class materials', 'Other'];
const SUPPLY_CATEGORIES = ['Seeds', 'Soil', 'Fertilizer', 'Tools', 'Irrigation', 'Packaging', 'Pest control', 'Other'];

const resources = {
  crops: {
    path: 'crops', table: 'crops', singular: 'Crop', plural: 'Crops & Varieties', icon: 'flower1', archivable: true,
    from: 'crops r', select: 'r.*', searchCols: ['r.name', 'r.variety', 'r.category'], order: 'r.name COLLATE NOCASE, r.variety COLLATE NOCASE',
    extras: 'crop',
    fields: [
      { name: 'name', label: 'Crop name', type: 'text', required: true, half: true },
      { name: 'variety', label: 'Variety', type: 'text', half: true },
      { name: 'category', label: 'Category', type: 'select', options: opts(['Fruiting vegetable', 'Leafy green', 'Root vegetable', 'Herb', 'Legume', 'Squash & melon', 'Allium', 'Other']), half: true },
      { name: 'days_to_maturity', label: 'Days to maturity', type: 'integer', min: 0, max: 730, half: true },
      { name: 'default_unit', label: 'Selling unit', type: 'select', options: opts(U.weight), required: true, default: 'lb', half: true },
      { name: 'sale_price', label: 'Default price per unit', type: 'money', default: 0, half: true },
      { name: 'listed', label: 'Show on the public produce page', type: 'checkbox', default: 1 },
      { name: 'description', label: 'Public description', type: 'textarea' },
      { name: 'photo', label: 'Photo', type: 'image' },
      { name: 'notes', label: 'Growing notes (private)', type: 'textarea' },
    ],
    columns: [
      { key: 'name', label: 'Crop', link: true }, { key: 'variety', label: 'Variety' },
      { key: 'category', label: 'Category', cls: 'd-none d-md-table-cell' },
      { key: 'days_to_maturity', label: 'Days', type: 'number', cls: 'd-none d-lg-table-cell text-end' },
      { key: 'sale_price', label: 'Price', type: 'money', cls: 'text-end' },
      { key: 'listed', label: 'Public', type: 'flag', cls: 'd-none d-md-table-cell' },
    ],
    filters: [{ name: 'category', label: 'Category', where: 'r.category = ?', options: opts(['Fruiting vegetable', 'Leafy green', 'Root vegetable', 'Herb', 'Legume', 'Squash & melon', 'Allium', 'Other']) }],
  },

  plots: {
    path: 'plots', table: 'plots', singular: 'Growing space', plural: 'Fields, Beds & Greenhouses', icon: 'grid-3x3-gap', archivable: true,
    from: 'plots r', select: 'r.*, ROUND(r.length_m * r.width_m, 1) AS area_sqm', searchCols: ['r.name', 'r.location', 'r.method'], order: 'r.name COLLATE NOCASE',
    extras: 'plot',
    fields: [
      { name: 'name', label: 'Name / bed number', type: 'text', required: true, half: true },
      { name: 'kind', label: 'Type', type: 'select', options: [['field', 'Field'], ['bed', 'Bed'], ['greenhouse', 'Greenhouse'], ['container', 'Containers']], required: true, default: 'bed', half: true },
      { name: 'location', label: 'Location', type: 'text', half: true },
      { name: 'method', label: 'Growing method', type: 'select', options: opts(['Raised bed', 'In-ground', 'Greenhouse', 'Container', 'Hydroponic']), half: true },
      { name: 'length_m', label: 'Length (m)', type: 'number', min: 0, max: 100000, half: true },
      { name: 'width_m', label: 'Width (m)', type: 'number', min: 0, max: 100000, half: true },
      { name: 'capacity_plants', label: 'Capacity (plants)', type: 'integer', min: 0, max: 10000000, half: true },
      { name: 'active', label: 'Active (available for planting)', type: 'checkbox', default: 1 },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
    columns: [
      { key: 'name', label: 'Space', link: true }, { key: 'kind', label: 'Type', cls: 'text-capitalize' },
      { key: 'method', label: 'Method', cls: 'd-none d-md-table-cell' },
      { key: 'area_sqm', label: 'Area m²', type: 'qty', cls: 'text-end d-none d-md-table-cell' },
      { key: 'capacity_plants', label: 'Capacity', type: 'number', cls: 'text-end d-none d-lg-table-cell' },
      { key: 'active', label: 'Active', type: 'flag' },
    ],
    filters: [{ name: 'kind', label: 'Type', where: 'r.kind = ?', options: [['field', 'Field'], ['bed', 'Bed'], ['greenhouse', 'Greenhouse'], ['container', 'Containers']] }],
  },

  plantings: {
    path: 'plantings', table: 'planting_batches', singular: 'Planting batch', plural: 'Crops & Plantings', icon: 'seedling', archivable: true, image: true,
    from: 'planting_batches r JOIN crops c ON c.id = r.crop_id LEFT JOIN plots p ON p.id = r.plot_id',
    select: `r.*, c.name AS crop_name, c.variety AS crop_variety, p.name AS plot_name,
      COALESCE((SELECT SUM(h.quantity) FROM harvests h WHERE h.batch_id = r.id), 0) AS actual_yield`,
    searchCols: ['r.batch_code', 'c.name', 'c.variety', 'p.name'], order: 'r.harvest_start IS NULL, r.harvest_start, r.id DESC',
    extras: 'planting',
    fields: [
      { name: 'batch_code', label: 'Batch ID', type: 'text', help: 'Leave blank to generate one automatically (e.g. TOM-2610-01).', half: true, lockOnEdit: false },
      { name: 'crop_id', label: 'Crop & variety', type: 'ref', ref: { table: 'crops', label: "name || COALESCE(' – ' || variety, '')", where: 'archived = 0' }, labelAs: 'crop_name', required: true, half: true },
      { name: 'plot_id', label: 'Field / bed / greenhouse', type: 'ref', ref: { table: 'plots', label: 'name', where: 'archived = 0 AND active = 1' }, labelAs: 'plot_name', half: true },
      { name: 'seed_source', label: 'Seed source', type: 'text', half: true },
      { name: 'stage', label: 'Growth stage', type: 'select', options: STAGES, required: true, default: 'planned', half: true },
      { name: 'planting_method', label: 'Planting method', type: 'select', options: opts(['Direct sow', 'Transplant', 'Seedling start', 'Cutting / division']), half: true },
      { name: 'sow_date', label: 'Sowing date', type: 'date', half: true },
      { name: 'germination_date', label: 'Expected germination', type: 'date', half: true },
      { name: 'transplant_date', label: 'Transplant date', type: 'date', half: true },
      { name: 'harvest_start', label: 'Harvest window starts', type: 'date', half: true },
      { name: 'harvest_end', label: 'Harvest window ends', type: 'date', half: true },
      { name: 'qty_planted', label: 'Quantity planted', type: 'number', min: 0, half: true },
      { name: 'area_sqm', label: 'Area planted (m²)', type: 'number', min: 0, half: true },
      { name: 'rows_count', label: 'Rows', type: 'integer', min: 0, half: true },
      { name: 'expected_yield', label: 'Estimated yield', type: 'number', min: 0, half: true },
      { name: 'yield_unit', label: 'Yield unit', type: 'select', options: opts(U.weight), default: 'lb', half: true },
      { name: 'observations', label: 'Watering / fertilizer / pest observations', type: 'textarea' },
      { name: 'photo', label: 'Photo', type: 'image' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
    columns: [
      { key: 'batch_code', label: 'Batch', link: true }, { key: 'crop_name', label: 'Crop', type: 'crop' },
      { key: 'plot_name', label: 'Where', cls: 'd-none d-md-table-cell' },
      { key: 'stage', label: 'Stage', type: 'chip', chip: 'stage' },
      { key: 'harvest_start', label: 'Harvest from', type: 'date', cls: 'd-none d-lg-table-cell' },
      { key: 'actual_yield', label: 'Yield (act/est)', type: 'yield', cls: 'text-end d-none d-md-table-cell' },
    ],
    filters: [
      { name: 'stage', label: 'Stage', where: 'r.stage = ?', options: STAGES },
      { name: 'crop', label: 'Crop', where: 'r.crop_id = ?', ref: { table: 'crops', label: "name || COALESCE(' – ' || variety, '')" } },
    ],
  },

  tasks: {
    path: 'tasks', table: 'farm_tasks', singular: 'Farm task', plural: 'Staff & Tasks', icon: 'check2-square', archivable: false,
    from: 'farm_tasks r LEFT JOIN planting_batches b ON b.id = r.batch_id LEFT JOIN plots p ON p.id = r.plot_id LEFT JOIN staff s ON s.id = r.assigned_to',
    select: 'r.*, b.batch_code AS batch_code, p.name AS plot_name, s.name AS staff_name',
    searchCols: ['r.title', 'b.batch_code', 's.name'], order: 'r.done, r.due_date IS NULL, r.due_date, r.id',
    fields: [
      { name: 'title', label: 'Task', type: 'text', required: true },
      { name: 'task_type', label: 'Type', type: 'select', options: opts(TASK_TYPES), required: true, default: 'Other', half: true },
      { name: 'due_date', label: 'Due date', type: 'date', half: true },
      { name: 'batch_id', label: 'Planting batch', type: 'ref', ref: { table: 'planting_batches', label: 'batch_code', where: 'archived = 0' }, labelAs: 'batch_code', half: true },
      { name: 'plot_id', label: 'Field / bed', type: 'ref', ref: { table: 'plots', label: 'name', where: 'archived = 0' }, labelAs: 'plot_name', half: true },
      { name: 'assigned_to', label: 'Assigned to', type: 'ref', ref: { table: 'staff', label: 'name', where: 'active = 1' }, labelAs: 'staff_name', half: true },
      { name: 'done', label: 'Completed', type: 'checkbox', default: 0 },
      { name: 'notes', label: 'Notes', type: 'textarea' },
      { name: 'completed_at', type: 'text', hidden: true }, // set by the tasks hook
    ],
    columns: [
      { key: 'done', label: '', type: 'taskcheck' }, { key: 'title', label: 'Task', link: true },
      { key: 'task_type', label: 'Type', cls: 'd-none d-md-table-cell' },
      { key: 'due_date', label: 'Due', type: 'due' },
      { key: 'batch_code', label: 'Batch', cls: 'd-none d-lg-table-cell' },
      { key: 'staff_name', label: 'Assigned', cls: 'd-none d-md-table-cell' },
    ],
    filters: [
      { name: 'state', label: 'Status', where: 'r.done = ?', options: [['0', 'Open'], ['1', 'Done']] },
      { name: 'type', label: 'Type', where: 'r.task_type = ?', options: opts(TASK_TYPES) },
    ],
    defaultFilters: { state: '0' },
  },

  harvests: {
    path: 'harvests', table: 'harvests', singular: 'Harvest', plural: 'Harvest Log', icon: 'basket', archivable: false,
    serviceKey: 'harvest', // create/delete go through services/harvestService.js (creates the inventory lot)
    from: 'harvests r JOIN planting_batches b ON b.id = r.batch_id JOIN crops c ON c.id = b.crop_id',
    select: 'r.*, b.batch_code AS batch_code, c.name AS crop_name',
    searchCols: ['b.batch_code', 'c.name'], order: 'r.harvested_on DESC, r.id DESC',
    fields: [
      { name: 'batch_id', label: 'Planting batch', type: 'ref', ref: { table: 'planting_batches', label: "batch_code || ' – ' || (SELECT name FROM crops WHERE crops.id = crop_id)", where: "archived = 0 AND stage NOT IN ('failed')" }, labelAs: 'batch_code', required: true, lockOnEdit: true, half: true },
      { name: 'harvested_on', label: 'Harvest date', type: 'date', required: true, lockOnEdit: true, half: true, default: 'today' },
      { name: 'quantity', label: 'Quantity harvested', type: 'number', required: true, min: 0.01, lockOnEdit: true, half: true },
      { name: 'unit', label: 'Unit', type: 'select', options: opts(U.weight), required: true, default: 'lb', lockOnEdit: true, half: true },
      { name: 'grade', label: 'Quality grade', type: 'select', options: [['A', 'A – premium'], ['B', 'B – standard'], ['Seconds', 'Seconds / processing']], required: true, default: 'A', half: true },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
    columns: [
      { key: 'harvested_on', label: 'Date', type: 'date', link: true }, { key: 'crop_name', label: 'Crop' },
      { key: 'batch_code', label: 'Batch', cls: 'd-none d-md-table-cell' },
      { key: 'quantity', label: 'Quantity', type: 'qtyunit', cls: 'text-end' }, { key: 'grade', label: 'Grade', cls: 'd-none d-md-table-cell' },
    ],
    filters: [{ name: 'batch', label: 'Batch', where: 'r.batch_id = ?', ref: { table: 'planting_batches', label: 'batch_code' } }],
    hint: 'Recording a harvest creates a produce inventory lot. Quantity, unit and date are locked afterwards; use an inventory adjustment for spoilage or corrections.',
  },

  customers: {
    path: 'customers', table: 'customers', singular: 'Customer', plural: 'Customers', icon: 'people', archivable: true, feature: 'produceOrders',
    from: 'customers r', select: `r.*, (SELECT COUNT(*) FROM produce_orders o WHERE o.customer_id = r.id AND o.status != 'cancelled') AS order_count,
      (SELECT COALESCE(SUM(o.total - o.amount_paid), 0) FROM produce_orders o WHERE o.customer_id = r.id AND o.status != 'cancelled') AS balance`,
    searchCols: ['r.name', 'r.phone', 'r.email'], order: 'r.name COLLATE NOCASE', extras: 'customer',
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true, half: true },
      { name: 'phone', label: 'Phone', type: 'tel', half: true },
      { name: 'email', label: 'Email', type: 'email', half: true },
      { name: 'address', label: 'Address / delivery notes', type: 'text', half: true },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
    columns: [
      { key: 'name', label: 'Name', link: true }, { key: 'phone', label: 'Phone' },
      { key: 'email', label: 'Email', cls: 'd-none d-lg-table-cell text-break' },
      { key: 'order_count', label: 'Orders', type: 'number', cls: 'text-end' },
      { key: 'balance', label: 'Balance', type: 'money', cls: 'text-end' },
    ],
  },

  courses: {
    path: 'courses', table: 'courses', singular: 'Course', plural: 'Course Catalog', icon: 'mortarboard', archivable: true, feature: 'classes',
    from: 'courses r', select: `r.*, (SELECT COUNT(*) FROM class_sessions s WHERE s.course_id = r.id AND s.status = 'scheduled' AND s.starts_at >= datetime('now','localtime')) AS upcoming`,
    searchCols: ['r.title', 'r.instructor'], order: 'r.title COLLATE NOCASE', extras: 'course',
    fields: [
      { name: 'title', label: 'Course title', type: 'text', required: true },
      { name: 'difficulty', label: 'Difficulty', type: 'select', options: opts(['Beginner', 'Intermediate', 'Advanced']), required: true, default: 'Beginner', half: true },
      { name: 'instructor', label: 'Instructor', type: 'text', half: true },
      { name: 'duration_hours', label: 'Duration (hours)', type: 'number', min: 0, max: 1000, half: true },
      { name: 'default_price', label: 'Default price (0 = free)', type: 'money', default: 0, half: true },
      { name: 'overview', label: 'Overview', type: 'textarea' },
      { name: 'outcomes', label: 'Learning outcomes (one per line)', type: 'textarea' },
      { name: 'materials', label: 'Materials to bring / provided', type: 'textarea' },
      { name: 'published', label: 'Show on the public classes page', type: 'checkbox', default: 1 },
      { name: 'slug', type: 'text', hidden: true }, // set by the courses hook
    ],
    columns: [
      { key: 'title', label: 'Course', link: true }, { key: 'difficulty', label: 'Level', cls: 'd-none d-md-table-cell' },
      { key: 'instructor', label: 'Instructor', cls: 'd-none d-md-table-cell' },
      { key: 'default_price', label: 'Price', type: 'money', cls: 'text-end' },
      { key: 'upcoming', label: 'Upcoming', type: 'number', cls: 'text-end' }, { key: 'published', label: 'Public', type: 'flag', cls: 'd-none d-lg-table-cell' },
    ],
  },

  classes: {
    path: 'classes', table: 'class_sessions', singular: 'Class session', plural: 'Classes & Workshops', icon: 'calendar-event', archivable: false, feature: 'classes',
    from: 'class_sessions r JOIN courses c ON c.id = r.course_id',
    select: `r.*, c.title AS course_title, c.slug AS course_slug,
      (SELECT COUNT(*) FROM enrollments e WHERE e.session_id = r.id AND e.status IN ('registered','completed')) AS enrolled,
      (SELECT COUNT(*) FROM enrollments e WHERE e.session_id = r.id AND e.status = 'waitlisted') AS waiting`,
    searchCols: ['c.title', 'r.location'], order: 'r.starts_at DESC', extras: 'session', titleKey: 'course_title',
    fields: [
      { name: 'course_id', label: 'Course', type: 'ref', ref: { table: 'courses', label: 'title', where: 'archived = 0' }, labelAs: 'course_title', required: true, half: true },
      { name: 'status', label: 'Status', type: 'select', options: [['scheduled', 'Scheduled'], ['completed', 'Completed'], ['cancelled', 'Cancelled']], required: true, default: 'scheduled', half: true },
      { name: 'starts_at', label: 'Starts', type: 'datetime', required: true, half: true },
      { name: 'ends_at', label: 'Ends', type: 'datetime', half: true },
      { name: 'location', label: 'Location', type: 'text', half: true },
      { name: 'capacity', label: 'Capacity (seats)', type: 'integer', required: true, min: 0, max: 5000, default: 10, half: true },
      { name: 'price', label: 'Price (blank = course default)', type: 'money', half: true },
      { name: 'deadline', label: 'Registration deadline', type: 'date', half: true },
      { name: 'waitlist', label: 'Offer a waitlist when full', type: 'checkbox', default: 1 },
      { name: 'cancel_policy', label: 'Cancellation policy', type: 'textarea' },
      { name: 'notes', label: 'Internal notes', type: 'textarea' },
    ],
    columns: [
      { key: 'starts_at', label: 'When', type: 'datetime', link: true }, { key: 'course_title', label: 'Course' },
      { key: 'location', label: 'Location', cls: 'd-none d-lg-table-cell' },
      { key: 'enrolled', label: 'Seats', type: 'seats', cls: 'text-end' },
      { key: 'status', label: 'Status', type: 'chip', chip: 'session' },
    ],
    filters: [
      { name: 'status', label: 'Status', where: 'r.status = ?', options: [['scheduled', 'Scheduled'], ['completed', 'Completed'], ['cancelled', 'Cancelled']] },
      { name: 'when', label: 'When', special: 'when', options: [['upcoming', 'Upcoming'], ['past', 'Past']] },
    ],
    defaultFilters: { when: 'upcoming' },
  },

  students: {
    path: 'students', table: 'students', singular: 'Student', plural: 'Students', icon: 'person-lines-fill', archivable: true, feature: 'classes',
    from: 'students r', select: `r.*, (SELECT COUNT(*) FROM enrollments e WHERE e.student_id = r.id AND e.status IN ('registered','completed')) AS classes_count`,
    searchCols: ['r.name', 'r.email', 'r.phone'], order: 'r.name COLLATE NOCASE', extras: 'student',
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true, half: true },
      { name: 'email', label: 'Email', type: 'email', half: true },
      { name: 'phone', label: 'Phone', type: 'tel', half: true },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
    columns: [
      { key: 'name', label: 'Student', link: true }, { key: 'email', label: 'Email', cls: 'd-none d-md-table-cell text-break' },
      { key: 'phone', label: 'Phone', cls: 'd-none d-md-table-cell' }, { key: 'classes_count', label: 'Classes', type: 'number', cls: 'text-end' },
    ],
  },

  supplies: {
    path: 'supplies', table: 'supplies', singular: 'Supply', plural: 'Supplies', icon: 'box-seam', archivable: true,
    from: 'supplies r', select: 'r.*, CASE WHEN r.quantity <= r.reorder_level THEN 1 ELSE 0 END AS low',
    searchCols: ['r.name', 'r.supplier', 'r.category'], order: 'low DESC, r.name COLLATE NOCASE',
    fields: [
      { name: 'name', label: 'Item', type: 'text', required: true, half: true },
      { name: 'category', label: 'Category', type: 'select', options: opts(SUPPLY_CATEGORIES), required: true, default: 'Other', half: true },
      { name: 'quantity', label: 'In stock', type: 'number', min: 0, required: true, default: 0, half: true },
      { name: 'unit', label: 'Unit', type: 'text', half: true },
      { name: 'reorder_level', label: 'Reorder when at or below', type: 'number', min: 0, default: 0, half: true },
      { name: 'unit_cost', label: 'Cost per unit', type: 'money', default: 0, half: true },
      { name: 'supplier', label: 'Supplier', type: 'text', half: true },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
    columns: [
      { key: 'name', label: 'Item', link: true }, { key: 'category', label: 'Category', cls: 'd-none d-md-table-cell' },
      { key: 'quantity', label: 'In stock', type: 'qtyunit', cls: 'text-end' },
      { key: 'reorder_level', label: 'Reorder at', type: 'qty', cls: 'text-end d-none d-md-table-cell' },
      { key: 'low', label: 'Status', type: 'low' },
    ],
    filters: [
      { name: 'category', label: 'Category', where: 'r.category = ?', options: opts(SUPPLY_CATEGORIES) },
      { name: 'low', label: 'Stock', where: 'low = ?', having: true, options: [['1', 'Low / reorder']] },
    ],
  },

  equipment: {
    path: 'equipment', table: 'equipment', singular: 'Equipment', plural: 'Equipment', icon: 'tools', archivable: true,
    from: 'equipment r', select: "r.*, CASE WHEN r.next_maintenance IS NOT NULL AND r.next_maintenance < date('now','localtime') THEN 1 ELSE 0 END AS overdue",
    searchCols: ['r.name', 'r.kind'], order: 'r.name COLLATE NOCASE',
    fields: [
      { name: 'name', label: 'Equipment', type: 'text', required: true, half: true },
      { name: 'kind', label: 'Type', type: 'text', half: true },
      { name: 'status', label: 'Status', type: 'select', options: [['ready', 'Ready'], ['in use', 'In use'], ['needs repair', 'Needs repair'], ['retired', 'Retired']], required: true, default: 'ready', half: true },
      { name: 'last_maintenance', label: 'Last maintenance', type: 'date', half: true },
      { name: 'next_maintenance', label: 'Next maintenance due', type: 'date', half: true },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
    columns: [
      { key: 'name', label: 'Equipment', link: true }, { key: 'kind', label: 'Type', cls: 'd-none d-md-table-cell' },
      { key: 'status', label: 'Status', cls: 'text-capitalize' },
      { key: 'next_maintenance', label: 'Maintenance due', type: 'due' },
    ],
  },

  expenses: {
    path: 'expenses', table: 'expenses', singular: 'Expense', plural: 'Expenses', icon: 'wallet2', archivable: false,
    from: 'expenses r', select: 'r.*', searchCols: ['r.description', 'r.vendor', 'r.category'], order: 'r.expense_date DESC, r.id DESC',
    fields: [
      { name: 'expense_date', label: 'Date', type: 'date', required: true, default: 'today', half: true },
      { name: 'category', label: 'Category', type: 'select', options: opts(EXPENSE_CATEGORIES), required: true, half: true },
      { name: 'amount', label: 'Amount', type: 'money', required: true, half: true },
      { name: 'vendor', label: 'Vendor', type: 'text', half: true },
      { name: 'description', label: 'Description', type: 'text' },
    ],
    columns: [
      { key: 'expense_date', label: 'Date', type: 'date', link: true }, { key: 'category', label: 'Category' },
      { key: 'description', label: 'Description', cls: 'd-none d-md-table-cell' }, { key: 'vendor', label: 'Vendor', cls: 'd-none d-lg-table-cell' },
      { key: 'amount', label: 'Amount', type: 'money', cls: 'text-end' },
    ],
    filters: [{ name: 'category', label: 'Category', where: 'r.category = ?', options: opts(EXPENSE_CATEGORIES) }],
    totalColumn: 'amount',
  },

  staff: {
    path: 'staff', table: 'staff', singular: 'Staff member', plural: 'Staff', icon: 'person-badge', archivable: false,
    from: 'staff r', select: "r.*, (SELECT COUNT(*) FROM farm_tasks t WHERE t.assigned_to = r.id AND t.done = 0) AS open_tasks",
    searchCols: ['r.name', 'r.role', 'r.email'], order: 'r.active DESC, r.name COLLATE NOCASE',
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true, half: true },
      { name: 'role', label: 'Role', type: 'select', options: opts(['Owner', 'Manager', 'Farm hand', 'Instructor', 'Seasonal']), required: true, default: 'Farm hand', half: true },
      { name: 'email', label: 'Email', type: 'email', half: true },
      { name: 'phone', label: 'Phone', type: 'tel', half: true },
      { name: 'active', label: 'Active', type: 'checkbox', default: 1 },
      { name: 'notes', label: 'Responsibilities / notes', type: 'textarea' },
    ],
    columns: [
      { key: 'name', label: 'Name', link: true }, { key: 'role', label: 'Role' },
      { key: 'open_tasks', label: 'Open tasks', type: 'number', cls: 'text-end' }, { key: 'active', label: 'Active', type: 'flag' },
    ],
  },

  updates: {
    path: 'updates', table: 'farm_updates', singular: 'Farm update', plural: 'Farm Updates & Gallery', icon: 'images', archivable: false,
    from: 'farm_updates r', select: 'r.*', searchCols: ['r.title', 'r.body'], order: 'r.posted_on DESC, r.id DESC',
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true, half: true },
      { name: 'posted_on', label: 'Date', type: 'date', required: true, default: 'today', half: true },
      { name: 'body', label: 'Update', type: 'textarea' },
      { name: 'photo', label: 'Photo', type: 'image' },
      { name: 'published', label: 'Show on the public site', type: 'checkbox', default: 1 },
    ],
    columns: [
      { key: 'posted_on', label: 'Date', type: 'date' }, { key: 'title', label: 'Title', link: true },
      { key: 'published', label: 'Public', type: 'flag' },
    ],
  },

  livestock: {
    path: 'livestock', table: 'livestock', singular: 'Animal', plural: 'Livestock', icon: 'piggy-bank', archivable: true, feature: 'livestock',
    from: 'livestock r', select: 'r.*', searchCols: ['r.name_tag', 'r.species', 'r.breed'], order: 'r.species, r.name_tag',
    fields: [
      { name: 'name_tag', label: 'Name / tag', type: 'text', required: true, half: true },
      { name: 'species', label: 'Species', type: 'text', required: true, half: true },
      { name: 'breed', label: 'Breed', type: 'text', half: true },
      { name: 'housing', label: 'Housing', type: 'text', half: true },
      { name: 'status', label: 'Status', type: 'select', options: opts(['healthy', 'under care', 'sold', 'deceased']), required: true, default: 'healthy', half: true },
      { name: 'notes', label: 'Care notes', type: 'textarea' },
    ],
    columns: [
      { key: 'name_tag', label: 'Animal', link: true }, { key: 'species', label: 'Species' },
      { key: 'housing', label: 'Housing', cls: 'd-none d-md-table-cell' }, { key: 'status', label: 'Status', cls: 'text-capitalize' },
    ],
  },
};

for (const [key, def] of Object.entries(resources)) {
  def.key = key;
  def.fieldMap = Object.fromEntries(def.fields.map((f) => [f.name, f]));
  def.hasImage = def.fields.some((f) => f.type === 'image');
}

module.exports = { resources, STAGES, TASK_TYPES, EXPENSE_CATEGORIES, units: U.weight, opts };
