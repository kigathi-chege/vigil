require 'cairo'

-- Centralized theme configuration
theme = {
    card_bg_color = {0, 0, 0, 0.8},
    card_border_color = {1, 1, 1, 0.2},
    text_color = {1, 1, 1, 0.9},
    text_secondary_color = {0.8, 0.8, 0.8, 0.8},
    font_verse = "DejaVu Sans",
    font_size_verse = 14,
    font_reference = "DejaVu Sans",
    font_size_reference = 12,
    font_system = "DejaVu Sans Mono",
    font_size_system = 11,
    card_corner_radius = 12,
    card_padding = 20,
    line_spacing = 1.4,
    widget_spacing = 15
}

-- Cairo surface management
local cs, cr

function init_cairo()
    if conky_window == nil then return nil end
    cs = cairo_xlib_surface_create(conky_window.display, conky_window.drawable,
                                  conky_window.visual, conky_window.width, conky_window.height)
    cr = cairo_create(cs)
    return cr
end

function cleanup_cairo()
    if cr then cairo_destroy(cr) end
    if cs then cairo_surface_destroy(cs) end
end

-- Drawing helpers
function draw_rounded_rectangle(cr, x, y, width, height, radius)
    cairo_new_sub_path(cr)
    cairo_arc(cr, x + radius, y + radius, radius, math.pi, 3 * math.pi / 2)
    cairo_arc(cr, x + width - radius, y + radius, radius, 3 * math.pi / 2, 0)
    cairo_arc(cr, x + width - radius, y + height - radius, radius, 0, math.pi / 2)
    cairo_arc(cr, x + radius, y + height - radius, radius, math.pi / 2, math.pi)
    cairo_close_path(cr)
end

function draw_card_background(cr, x, y, width, height)
    draw_rounded_rectangle(cr, x, y, width, height, theme.card_corner_radius)
    cairo_set_source_rgba(cr, theme.card_bg_color[1], theme.card_bg_color[2], 
                         theme.card_bg_color[3], theme.card_bg_color[4])
    cairo_fill_preserve(cr)
    cairo_set_source_rgba(cr, theme.card_border_color[1], theme.card_border_color[2], 
                         theme.card_border_color[3], theme.card_border_color[4])
    cairo_set_line_width(cr, 1)
    cairo_stroke(cr)
end

function wrap_text(cr, text, max_width, font_face, font_size)
    cairo_select_font_face(cr, font_face, CAIRO_FONT_SLANT_NORMAL, CAIRO_FONT_WEIGHT_NORMAL)
    cairo_set_font_size(cr, font_size)
    
    local words = {}
    for word in text:gmatch("%S+") do
        table.insert(words, word)
    end
    
    local lines = {}
    local current_line = ""
    
    for i, word in ipairs(words) do
        local test_line = current_line == "" and word or current_line .. " " .. word
        local text_extents = cairo_text_extents_t:create()
        cairo_text_extents(cr, test_line, text_extents)
        
        if text_extents.width <= max_width then
            current_line = test_line
        else
            if current_line ~= "" then
                table.insert(lines, current_line)
                current_line = word
            else
                table.insert(lines, word)
            end
        end
    end
    
    if current_line ~= "" then
        table.insert(lines, current_line)
    end
    
    return lines
end

-- Text rendering helpers
function render_text_lines(cr, lines, x, y, font_face, font_size, color, line_spacing)
    cairo_set_source_rgba(cr, color[1], color[2], color[3], color[4])
    cairo_select_font_face(cr, font_face, CAIRO_FONT_SLANT_NORMAL, CAIRO_FONT_WEIGHT_NORMAL)
    cairo_set_font_size(cr, font_size)
    
    for i, line in ipairs(lines) do
        cairo_move_to(cr, x, y + (i * font_size * line_spacing))
        cairo_show_text(cr, line)
    end
end

function render_right_aligned_text(cr, text, x, y, width, font_face, font_size, color)
    cairo_set_source_rgba(cr, color[1], color[2], color[3], color[4])
    cairo_select_font_face(cr, font_face, CAIRO_FONT_SLANT_ITALIC, CAIRO_FONT_WEIGHT_NORMAL)
    cairo_set_font_size(cr, font_size)
    
    local text_extents = cairo_text_extents_t:create()
    cairo_text_extents(cr, text, text_extents)
    
    local text_x = x + width - text_extents.width
    cairo_move_to(cr, text_x, y)
    cairo_show_text(cr, text)
end

-- Cache helpers
function file_exists(path)
    local f = io.open(path, "r")
    if f then f:close() return true end
    return false
end

function read_json_cache(file_path)
    if not file_exists(file_path) then return nil end
    local f = io.open(file_path, "r")
    if not f then return nil end
    local content = f:read("*a")
    f:close()
    return content
end

function write_json_cache(file_path, content)
    local dir = file_path:match("(.*/)[^/]*$")
    if dir then os.execute("mkdir -p " .. dir) end
    local f = io.open(file_path, "w")
    if f then
        f:write(content)
        f:close()
        return true
    end
    return false
end
