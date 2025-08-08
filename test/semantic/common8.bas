' Implicit common arrays are assumed to be dynamic.
' So the index expression here should be a subscript error.
common x%()
print x%(0)