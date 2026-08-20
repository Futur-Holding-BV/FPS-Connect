import * as React from "react"
import { CalendarIcon } from "lucide-react"
import { nl } from "date-fns/locale"
import { format } from "date-fns"
import { Calendar } from "@/components/ui/calendar"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import {
  formatYmd,
  MAX_DATUM_JAAR,
  MIN_DATUM_JAAR,
  parseYmd,
} from "@/components/ui/date-picker-ymd"

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

const STANDAARD_STARTMAAND = parseYmd(`${MIN_DATUM_JAAR}-01-01`)!
const STANDAARD_EINDMAAND = parseYmd(`${MAX_DATUM_JAAR}-12-31`)!

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
  const selected = parseYmd(value)
  const fromDate = parseYmd(min)
  const toDate = parseYmd(max)
  const [month, setMonth] = React.useState<Date>(selected ?? new Date())
  const heeftOngeldigeWaarde = Boolean(value && !selected)

  React.useEffect(() => {
    const opgeslagenDatum = parseYmd(value)
    if (opgeslagenDatum) setMonth(opgeslagenDatum)
  }, [value])

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
          aria-invalid={heeftOngeldigeWaarde || undefined}
          className={cn(
            "w-full justify-start text-left font-normal",
            !selected && "text-muted-foreground",
            heeftOngeldigeWaarde && "border-destructive text-destructive",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
          {selected
            ? format(selected, "d MMMM yyyy", { locale: nl })
            : heeftOngeldigeWaarde
              ? "Ongeldige datum — kies opnieuw"
              : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(day) => {
            onChange(day ? formatYmd(day) : "")
            setOpen(false)
          }}
          disabled={isDisabledDay}
          captionLayout="dropdown"
          month={month}
          onMonthChange={setMonth}
          startMonth={fromDate ?? STANDAARD_STARTMAAND}
          endMonth={toDate ?? STANDAARD_EINDMAAND}
        />
      </PopoverContent>
    </Popover>
  )
}
