function fib(n)
  if n <= 2 then
    fib = 1
  else
    fib = fib(n - 1) + fib(n - 2)
  end if
end function
print fib(8)