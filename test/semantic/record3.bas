type node
  ' recursive types don't work, so this doesn't parse
  parent as node
  left as node
  right as node
end type

dim tree as node