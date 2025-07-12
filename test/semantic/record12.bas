' Bug: Look up strings as fixed strings for record fields.
type stuff
  s as string * 20
end type
dim thing as stuff
thing.s$ = "ok"
print thing.s$
thing.s = "also ok"
print thing.s