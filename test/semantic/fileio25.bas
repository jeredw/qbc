' Bug: close with no args closes everything.
open "foo" for output as #1
close
open "foo" for append as #1