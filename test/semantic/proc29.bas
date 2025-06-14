' Function lookup ignores type if sigils are not specified.
function foo$
  ' Should implicitly be typed as a string.
  foo = "hello"
end function

' Both foo and foo$ refer to function foo$.
print foo; foo$