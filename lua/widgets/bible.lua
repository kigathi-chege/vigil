-- Bible verse widget
-- Get project root directory for cache file
local script_dir = debug.getinfo(1, "S").source:match("@(.*/)")
local project_root = script_dir:gsub("/lua/widgets/$", "/")
local cache_file = project_root .. "cache/verse.json"

-- Fallback verses when API is unavailable
local fallback_verses = {
    {text = "For I know the thoughts that I think toward you, saith the LORD, thoughts of peace, and not of evil, to give you an expected end.", reference = "Jeremiah 29:11"},
    {text = "The LORD is my shepherd; I shall not want.\nHe maketh me to lie down in green pastures:\nHe leadeth me beside the still waters.\nHe restoreth my soul:\nHe leadeth me in the paths of righteousness for his name's sake.", reference = "Psalm 23:1-3"},
    {text = "For I know nothing by myself; yet am I not hereby justified: but he that judgeth me is the Lord. Therefore judge nothing before the time, until the Lord come, who both will bring to light the hidden things of darkness, and will make manifest the counsels of the hearts: and then shall every man have praise of God.\nAnd these things, brethren, I have in a figure transferred to myself and to Apollos for your sakes; that ye might learn in us not to think of men above that which is written, that no one of you be puffed up for one against another. For who maketh thee to differ from another? and what hast thou that thou didst not receive? now if thou didst receive it, why dost thou glory, as if thou hadst not received it?", reference = "1 Corinthians 4:4-8"},
    {text = "I can do all things through Christ which strengtheneth me.", reference = "Philippians 4:13"},
    {text = "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.", reference = "John 3:16"},
    {text = "And we know that all things work together for good to them that love God, to them who are the called according to his purpose.", reference = "Romans 8:28"},
    {text = "Fear thou not; for I am with thee:\nbe no dismayed; for I am thy God:\nI will strengthen thee; yea, I will help thee; yea, I will uphold thee with the right hand of my righteousness.", reference = "Isaiah 41:10"},
    {text = "God is our refuge and our strength,\nA very present help in trouble.", reference = "Psalm 46:1"},
    {text = "But the fruit of the Spirit is love, joy, peace, longsuffering, gentleness, goodness, faith, meekness, temperance: against such there is no law.", reference = "Galatians 5:22-23"},
    {text = "Now faith is the substance of things hoped for, the evidence of things not seen.", reference = "Hebrews 11:1"},
    {text = "For God has not given us the spirit of fear; but of power, and of love, and of a sound mind.", reference = "2 Timothy 1:7"},
    {text = "There hath no temptation taken you but such as is common to man: but God is faithful, who will not suffer you to be tempted above that ye are able; but will with the temptation also make a way to escape, that ye may be able to bear it.", reference = "1 Corinthians 10:13"},
    {text = "Train up a child in the way he should go:\nAnd when he is old, he will not depart from it.", reference = "Proverbs 22:6"},
    {text = "But they that wait upon the LORD shall renew their strength; they shall mount up with wings as eagles; they shall run, and not be weary; and they shall walk, and not faint.", reference = "Isaiah 40:31"},
    {text = "Have not I commanded thee? Be strong and of a good courage; be not afraid, neither be thou dismayed: for the LORD thy God is with thee whithersoever thou goest.", reference = "Joshua 1:9"},
    {text = "Looking unto Jesus the author and finisher of our faith; who for the joy that was set before him endured the cross, despising the shame, and is set down at the right hand of the throne of God.", reference = "Hebrews 12:2"},
    {text = "Come unto me, all ye that labour and are heavy laden, and I will give you rest.", reference = "Matthew 11:28"},
    {text = "That if thou shalt confess with they mouth the Lord Jesus, and shalt believe in thine heart that God hath raised him from the dead, thou shalt be saved. For with the heart man believeth unto righteousness; and with the mouth confession is made unto salvation.", reference = "Romans 10:9-10"},
    {text = "Let nothing be done through strife or vainglory; but in lowliness of mind let each esteem other better than themselves. Look not every man on his own things, but every man also on the things of others.", reference = "Philippians 2:3-4"},
    {text = "Ye have heard that it hath been said, Thou shalt love thy neighbour, and hate thine enemy. But I say unto you, Love your enemies, bless them that curse you, do good to them that hate you, and pray for them which despitefully use you, and persecute you;", reference = "Matthew 5:43-44"}
}

-- Widget state
local verse_data = {
    text = "Loading verse...",
    reference = "",
    last_fetch = 0,
    last_date = "",
    fetch_attempted = false
}

-- Initialize random seed
math.randomseed(os.time())

local function get_current_date()
    return os.date("%Y-%m-%d")
end

local function get_fallback_verse()
    local index = math.random(1, #fallback_verses)
    return fallback_verses[index]
end

local function should_fetch_verse()
    local current_time = os.time()
    local current_date = get_current_date()
    
    if not verse_data.fetch_attempted then
        return true
    end
    
    if verse_data.last_date ~= current_date then
        local midnight = os.time({year=tonumber(os.date("%Y")), month=tonumber(os.date("%m")), 
                                 day=tonumber(os.date("%d")), hour=0, min=0, sec=0})
        local random_delay = math.random(0, 3600)
        
        if current_time >= midnight + random_delay then
            return true
        end
    end
    
    return false
end

local function parse_cached_verse(content)
    local text = content:match('"text":"([^"]*)"')
    local reference = content:match('"reference":"([^"]*)"')
    local timestamp = content:match('"timestamp":(%d+)')
    local date = content:match('"date":"([^"]*)"')
    
    if text and reference and timestamp and date then
        return {
            text = text:gsub("\\n", "\n"):gsub('\\"', '"'),
            reference = reference,
            timestamp = tonumber(timestamp),
            date = date
        }
    end
    return nil
end

local function cache_verse(data)
    local escaped_text = data.text:gsub('"', '\\"'):gsub("\n", "\\n")
    local json = string.format('{"text":"%s","reference":"%s","timestamp":%d,"date":"%s"}',
        escaped_text, data.reference, data.timestamp, data.date)
    write_json_cache(cache_file, json)
end

local function fetch_verse()
    verse_data.fetch_attempted = true
    
    local handle = io.popen('curl -s --connect-timeout 10 "https://beta.ourmanna.com/api/v1/get?format=json" 2>/dev/null')
    if not handle then return false end
    
    local result = handle:read("*a")
    local success = handle:close()
    
    if not success or not result or result == "" then return false end
    
    local text = result:match('"text":"([^"]*)"')
    local reference = result:match('"reference":"([^"]*)"')
    
    if text and reference then
        text = text:gsub("\\n", "\n"):gsub('\\"', '"')
        verse_data.text = text
        verse_data.reference = reference
        verse_data.last_fetch = os.time()
        verse_data.last_date = get_current_date()
        
        cache_verse({
            text = text,
            reference = reference,
            timestamp = verse_data.last_fetch,
            date = verse_data.last_date
        })
        return true
    end
    
    return false
end

local function load_verse_data()
    local cached_content = read_json_cache(cache_file)
    local cached = cached_content and parse_cached_verse(cached_content)
    
    if cached then
        verse_data.text = cached.text
        verse_data.reference = cached.reference
        verse_data.last_fetch = cached.timestamp
        verse_data.last_date = cached.date
    end
    
    if should_fetch_verse() then
        if not fetch_verse() then
            if not cached then
                -- No cached verse and API failed, use fallback
                local fallback = get_fallback_verse()
                verse_data.text = fallback.text
                verse_data.reference = fallback.reference
            end
            -- If we have cached verse, keep using it when API fails
        end
    end
end

function bible_widget(cr, x, y, width, height)
    load_verse_data()
    
    -- Calculate actual height needed
    local max_text_width = width - (theme.card_padding * 2)
    local verse_lines = wrap_text(cr, verse_data.text, max_text_width, 
                                 theme.font_verse, theme.font_size_verse)
    
    local verse_height = #verse_lines * theme.font_size_verse * theme.line_spacing
    local ref_height = theme.font_size_reference * 1.2
    local total_text_height = verse_height + ref_height + 10
    local actual_height = math.max(height, total_text_height + (theme.card_padding * 2))
    
    -- Skip drawing if this is a measurement call (negative coordinates)
    if x < 0 or y < 0 then
        return actual_height
    end
    
    -- Draw card background
    draw_card_background(cr, x, y, width, actual_height)
    
    -- Draw verse text
    render_text_lines(cr, verse_lines, x + theme.card_padding, y + theme.card_padding,
                     theme.font_verse, theme.font_size_verse, theme.text_color, theme.line_spacing)
    
    -- Draw reference
    if verse_data.reference ~= "" then
        local ref_text = "— " .. verse_data.reference
        local ref_y = y + theme.card_padding + verse_height + 20
        render_right_aligned_text(cr, ref_text, x + theme.card_padding, ref_y, 
                                 width - (theme.card_padding * 2), theme.font_reference, 
                                 theme.font_size_reference, theme.text_secondary_color)
    end
    
    return actual_height
end
