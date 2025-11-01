#!/usr/bin/env bash

# add-reminder - Add tasks to Apple Reminders
# Usage: add-reminder -t title [-l list] [-u url] [-g tags] [-d date] [-p priority]

add_reminder() {
  local OPTIND opt
  local title="" url="" tags="" date="" priority="0" list="HCP Email"

  while getopts "t:l:u:g:d:p:h" opt; do
    case $opt in
    t) title="$OPTARG" ;;
    l) list="$OPTARG" ;;
    u) url="$OPTARG" ;;
    g) tags="$OPTARG" ;;
    d) date="$OPTARG" ;;
    p) priority="$OPTARG" ;;
    h)
      cat <<-EOF
				Usage: $(basename $0) -t title [-l list] [-u url] [-g tags] [-d date] [-p priority]
				  -t  Title (required)
				  -l  List name (default: "HCP Email")
				  -u  URL to attach
				  -g  Comma-separated tags
				  -d  Due date (MM/DD/YYYY at HH:MM AM/PM)
				  -p  Priority (0=none, 1=low, 2=medium, 3=high)

				Examples:
				  $(basename $0) -t "Review PR" -l "Work"
				  $(basename $0) -t "Buy milk" -l "Personal" -p 2
				  $(basename $0) -t "Fix bug" -u "https://github.com/..." -g "urgent,bug"
				EOF
      return
      ;;
    *) return 1 ;;
    esac
  done

  [[ -z "$title" ]] && {
    echo "Error: Title required (-t)"
    return 1
  }

  osascript - "$title" "$list" "$url" "$tags" "$date" "$priority" <<'END'
    on run {title, listName, urlStr, tags, due, pri}
        tell application "Reminders"
            if not (exists list listName) then
                make new list with properties {name:listName}
                log "Created new list: " & listName
            end if
            tell list listName
                set r to make new reminder with properties {name:title}
                set priority of r to (pri as integer)
                if urlStr ≠ "" then
                    set body of r to (urlStr as text)
                end if
                if due ≠ "" then
                    try
                        set due date of r to my parseDate(due)
                    on error errMsg
                        log "Date parsing failed: " & errMsg
                    end try
                end if
                -- Note: Tags are not directly supported via AppleScript in Apple Reminders
                -- The tags parameter is currently ignored
            end tell
        end tell
        return "✓ Added to '" & listName & "': " & title
    end run

    on parseDate(dateStr)
        -- Parse "MM/DD/YYYY at HH:MM AM/PM" format
        set oldDelims to AppleScript's text item delimiters

        -- Remove " at " to simplify parsing
        set AppleScript's text item delimiters to " at "
        set datePart to text item 1 of dateStr
        set timePart to text item 2 of dateStr

        -- Parse date: MM/DD/YYYY
        set AppleScript's text item delimiters to "/"
        set monthNum to (text item 1 of datePart) as integer
        set dayNum to (text item 2 of datePart) as integer
        set yearNum to (text item 3 of datePart) as integer

        -- Parse time: HH:MM AM/PM
        set AppleScript's text item delimiters to " "
        set timeOnly to text item 1 of timePart
        set ampm to text item 2 of timePart

        set AppleScript's text item delimiters to ":"
        set hourNum to (text item 1 of timeOnly) as integer
        set minuteNum to (text item 2 of timeOnly) as integer

        -- Restore delimiters
        set AppleScript's text item delimiters to oldDelims

        -- Build the date
        set d to current date
        set month of d to monthNum
        set day of d to dayNum
        set year of d to yearNum
        set minutes of d to minuteNum
        set seconds of d to 0

        -- Handle AM/PM
        if ampm is "PM" and hourNum ≠ 12 then
            set hours of d to hourNum + 12
        else if ampm is "AM" and hourNum = 12 then
            set hours of d to 0
        else
            set hours of d to hourNum
        end if

        return d
    end parseDate
END
}

# Call the function with all arguments
add_reminder "$@"
