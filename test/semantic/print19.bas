' Bug: Trying to print a nested record should raise an error.
type monkey
  assertiveness as double
end type

type zoo
  m as monkey
end type

dim z as zoo

' z.m isn't printable
print z.m