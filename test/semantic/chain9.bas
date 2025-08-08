' Tests loading common record data in a chained-to program.
type monkey
assertiveness as double
end type

type trainer
age as integer
nom as string * 5
pet as monkey
end type

common stuff as trainer

print stuff.age
print stuff.nom
print stuff.pet.assertiveness