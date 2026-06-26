import * as React from "react"
import { CalendarIcon } from "lucide-react"
import { nl } from "date-fns/locale"
import { format, parse, isValid } from "date-fns"
import { Calendar } from "@/components/ui/calendar"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

interface DatePickerProps {
  value?: string | null
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  id?: string
  min?: string
  max?: string
}

function parseYMD(s: string | null | undefined): Date | undefined {
  if (!s) return undefined
  const d = parse(s, "yyyy-MM-dd", new Date())
  return isValid(d) ? d : undefined
}

function toYMD(d: Date): string {
  return format(d, "yyyy-MM-dd")
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Kies een datum",
  disabled,
  className,
  id,
  min,
  max,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const selected = parseYMD(value)
  const fromDate = parseYMD(min)
  const toDate = parseYMD(max)

  const isDisabledDay = React.useCallback(
    (day: Date) => {
      if (fromDate && day < fromDate) return true
      if (toDate && day > toDate) return true
      return false
    },
    [fromDate, toDate]
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal",
            !selected && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
          {selected
            ? format(selected, "d MMMM yyyy", { locale: nl })
            : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(day) => {
            onChange(day ? toYMD(day) : "")
            setOpen(false)
          }}
          disabled={isDisabledDay}
          captionLayout="dropdown"
          defaultMonth={selected ?? new Date()}
        />
      </PopoverContent>
    </Popover>
  )
}
