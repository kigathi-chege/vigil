-- System information widget
function system_widget(cr, x, y, width, height)
    -- Skip drawing if this is a measurement call (negative coordinates)
    if x < 0 or y < 0 then
        -- Calculate and return actual height needed
        local line_height = theme.font_size_system * 1.3
        local content_lines = 20 -- Increased for top processes
        return (content_lines * line_height) + (theme.card_padding * 2) + 40
    end
    
    -- Calculate dynamic height based on content
    local line_height = theme.font_size_system * 1.3
    local content_lines = 20 -- Increased for top processes
    local actual_height = (content_lines * line_height) + (theme.card_padding * 2) + 40
    
    -- Draw card background
    draw_card_background(cr, x, y, width, actual_height)
    
    local content_x = x + theme.card_padding
    local content_y = y + theme.card_padding + theme.font_size_system
    
    -- Set font for system info
    cairo_select_font_face(cr, theme.font_system, CAIRO_FONT_SLANT_NORMAL, CAIRO_FONT_WEIGHT_NORMAL)
    cairo_set_font_size(cr, theme.font_size_system)
    
    -- System info data with top processes
    local info = {
        {"System:", conky_parse("$sysname $nodename $kernel")},
        {"Uptime:", conky_parse("$uptime")},
        {"CPU Freq:", conky_parse("$freq MHz ($freq_g GHz)")},
        {"CPU Usage:", conky_parse("$cpu%")},
        {"RAM Usage:", conky_parse("$mem/$memmax - $memperc%")},
        {"Swap Usage:", conky_parse("$swap/$swapmax - $swapperc%")},
        {"Processes:", conky_parse("$processes (Running: $running_processes)")},
        {"", ""}, -- Separator
        {"File System:", ""},
        {" Root:", conky_parse("${fs_used /}/${fs_size /}")},
        {"", ""}, -- Separator
        {"Network:", ""},
        {" Up:", conky_parse("${upspeed}")},
        {" Down:", conky_parse("${downspeed}")},
        {"", ""}, -- Separator
        {"Name              PID     CPU%   MEM%", ""},
        {conky_parse("${top name 1}"), string.format("%s %s %s", 
            conky_parse("${top pid 1}"), conky_parse("${top cpu 1}"), conky_parse("${top mem 1}"))},
        {conky_parse("${top name 2}"), string.format("%s %s %s", 
            conky_parse("${top pid 2}"), conky_parse("${top cpu 2}"), conky_parse("${top mem 2}"))},
        {conky_parse("${top name 3}"), string.format("%s %s %s", 
            conky_parse("${top pid 3}"), conky_parse("${top cpu 3}"), conky_parse("${top mem 3}"))},
        {conky_parse("${top name 4}"), string.format("%s %s %s", 
            conky_parse("${top pid 4}"), conky_parse("${top cpu 4}"), conky_parse("${top mem 4}"))}
    }
    
    -- Draw system information
    for i, item in ipairs(info) do
        local current_y = content_y + (i * line_height)
        
        if item[1] == "" and item[2] == "" then
            -- Skip empty separator lines
        elseif item[1]:match("^%s") then
            -- Indented items (like file system details)
            cairo_set_source_rgba(cr, theme.text_color[1], theme.text_color[2], 
                                 theme.text_color[3], theme.text_color[4])
            cairo_move_to(cr, content_x + 10, current_y)
            cairo_show_text(cr, item[1] .. " " .. item[2])
        elseif item[2] == "" then
            -- Section headers (including process header)
            cairo_set_source_rgba(cr, theme.text_secondary_color[1], theme.text_secondary_color[2], 
                                 theme.text_secondary_color[3], theme.text_secondary_color[4])
            cairo_move_to(cr, content_x, current_y)
            cairo_show_text(cr, item[1])
        else
            -- Regular label-value pairs and process entries
            if item[1]:match("${top name") or not item[1]:match(":$") then
                -- Process entries - show name and stats
                cairo_set_source_rgba(cr, theme.text_color[1], theme.text_color[2], 
                                     theme.text_color[3], theme.text_color[4])
                cairo_move_to(cr, content_x, current_y)
                
                -- Format process name (truncate if too long)
                local process_name = item[1]:sub(1, 16)
                if #item[1] > 16 then process_name = process_name:sub(1, 13) .. "..." end
                
                cairo_show_text(cr, string.format("%-16s %s", process_name, item[2]))
            else
                -- Regular system info
                -- Draw label in secondary color
                cairo_set_source_rgba(cr, theme.text_secondary_color[1], theme.text_secondary_color[2], 
                                     theme.text_secondary_color[3], theme.text_secondary_color[4])
                cairo_move_to(cr, content_x, current_y)
                cairo_show_text(cr, item[1])
                
                -- Calculate label width for value positioning
                local text_extents = cairo_text_extents_t:create()
                cairo_text_extents(cr, item[1], text_extents)
                
                -- Draw value in primary color
                cairo_set_source_rgba(cr, theme.text_color[1], theme.text_color[2], 
                                     theme.text_color[3], theme.text_color[4])
                cairo_move_to(cr, content_x + text_extents.width + 10, current_y)
                cairo_show_text(cr, item[2])
            end
        end
    end
    
    return actual_height
end
