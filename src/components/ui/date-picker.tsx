"use client";

import { IconCalendar, IconX } from "@tabler/icons-react";
import { format, isValid, parseISO } from "date-fns";
import { zhCN } from "date-fns/locale";
import { useState } from "react";

import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

function parseDate(value: string): Date | undefined {
  if (!value) return undefined;
  const parsed = parseISO(value);
  return isValid(parsed) ? parsed : undefined;
}

export function DatePicker({
  name,
  id,
  value,
  onValueChange,
  placeholder = "请选择日期",
  className,
  invalid,
  describedBy,
}: {
  name: string;
  id?: string;
  value: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  invalid?: boolean;
  describedBy?: string;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Date | undefined>(() =>
    parseDate(value),
  );

  function update(nextDate: Date | undefined) {
    setSelected(nextDate);
    const nextValue = nextDate ? format(nextDate, "yyyy-MM-dd") : "";
    onValueChange?.(nextValue);
    if (nextDate) setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <input
        type="hidden"
        name={name}
        value={selected ? format(selected, "yyyy-MM-dd") : ""}
      />
      <PopoverTrigger
        render={
          <button
            type="button"
            id={id}
            data-invalid={invalid || undefined}
            aria-describedby={describedBy}
            className={cn(
              "flex min-h-11 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-input bg-white px-3 text-left text-[13px] font-normal text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/15 data-[invalid=true]:border-destructive data-[invalid=true]:ring-3 data-[invalid=true]:ring-destructive/15",
              !selected && "text-muted-foreground",
              className,
            )}
          />
        }
      >
        <span className="truncate">
          {selected ? format(selected, "yyyy-MM-dd") : placeholder}
        </span>
        <IconCalendar aria-hidden className="shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={update}
          defaultMonth={selected}
          locale={zhCN}
        />
        {selected ? (
          <button
            type="button"
            onClick={() => update(undefined)}
            className="flex min-h-11 w-full items-center justify-center gap-2 border-t border-border px-3 text-[13px] font-semibold text-muted-foreground hover:bg-muted"
          >
            <IconX aria-hidden />
            清除日期
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
