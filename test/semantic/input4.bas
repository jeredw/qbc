TYPE Demograph
  FullName AS STRING * 25
  Age  AS INTEGER
END TYPE
 
DIM Person AS Demograph
INPUT "Enter name and age: ";Person.FullName,Person.Age
PRINT Person.FullName, Person.Age