noargs
call noargs
onearg 1
call onearg(1)
twoargs 1, 2
call twoargs(1, 2)
twoargs 1+2\4, 3+7
call twoargs(1+2\4, 3+7)
twoargs (x), y
call twoargs((x), y)
threeargs a(), (b(2)), c(1)
call threeargs(a(), (b(2)), c(1))
