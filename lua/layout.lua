-- Get project root directory from this file's location
local script_dir = debug.getinfo(1, "S").source:match("@(.*/)")
local project_root = script_dir:gsub("/lua/$", "/")

-- Add project lua directory to package path
package.path = project_root .. "lua/?.lua;" .. package.path

require("core")
require("widgets.bible")
require("widgets.system")

-- Widget registry
local widgets = {
    {priority = 1, width = 400, height = 300, draw = system_widget},
    {priority = 2, width = 400, height = 200, draw = bible_widget}
}

-- Layout configuration
local layout = {
    start_x = 0,
    start_y = 0,
    max_column_height = 800,
    column_width = 420
}

-- Main drawing function
function conky_draw_dashboard()
    local cr = init_cairo()
    if not cr then return end
    
    -- Sort widgets by priority
    table.sort(widgets, function(a, b) return a.priority < b.priority end)
    
    local current_x = layout.start_x
    local current_y = layout.start_y
    local column_height = 0
    local max_height_needed = 0
    
    -- First pass: calculate actual heights
    local widget_heights = {}
    for i, widget in ipairs(widgets) do
        local widget_height = widget.height
        if widget.draw then
            -- Call widget to get actual height (widgets should return their real height)
            widget_height = widget.draw(cr, -1000, -1000, widget.width, widget.height) or widget.height
        end
        widget_heights[i] = widget_height
    end
    
    -- Second pass: draw widgets with correct positioning
    current_y = layout.start_y
    column_height = 0
    
    for i, widget in ipairs(widgets) do
        local widget_height = widget_heights[i]
        
        -- Check if we need to start a new column
        if column_height + widget_height > layout.max_column_height and column_height > 0 then
            current_x = current_x + layout.column_width
            current_y = layout.start_y
            column_height = 0
        end
        
        -- Draw the widget at correct position
        widget.draw(cr, current_x, current_y, widget.width, widget_height)
        
        -- Update position for next widget
        current_y = current_y + widget_height + theme.widget_spacing
        column_height = column_height + widget_height + theme.widget_spacing
        
        -- Track maximum height needed
        max_height_needed = math.max(max_height_needed, current_y)
    end
    
    cleanup_cairo()
end
