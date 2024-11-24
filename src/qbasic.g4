// Based on MS-DOS QBasic 1.1
//
// This grammar avoids antlr4 semantic predicates and sticks to language
// neutral notation, and so it relies on subsequent analysis to detect some
// kinds of syntax issues.  These are noted with *** in comments.
grammar qbasic;
import qbasiclexer;

// A program is one or more statements separated by ':' or NL.
// *** The QBasic IDE adds NL to the last line if it is missing, so callers
// should make sure to do this.
//
// For simplicity, in this grammar some statements like SUB must go at the top
// level and can't nest. Technically, the IDE will move SUB from a nested IF or
// DO to the top level at the end of the program, and unnests automatically if
// you start typing SUB inside another SUB (though it errors if you load a
// program with a nested SUB...END SUB).
//
// Some statements must be the first statement on a line, like the block form
// of IF (so you can't write "ELSE IF" instead of ELSEIF for example).  This is
// a real restriction that QBasic enforces.
program
  : (label?
      (statement
       | declare_statement
       | def_fn_statement
       | function_statement
       | if_block_statement
       | option_statement
       | sub_statement
       | type_statement)
      (':' statement
           | declare_statement
           | def_fn_statement
           | option_statement
           | type_statement)* NL)*
  ;

// block matches statements in loops, procedures, and conditionals.
// It does not allow some statements only allowed at the top level.
block
// blocks can go on one line, like START : block : END
  : (':' statement)* ':'
// blocks can also span many lines, like
// START: {block...
// ...
// ...}: END
  | (':' statement)* NL
    (label? (statement | if_block_statement) (':' statement)* NL)*
// Match block ending keyword in the parent statement, then match NL
// in the parent block or program.
    label? (statement | if_block_statement) (':' statement)*
  ;

label
  : (line_number | text_label ':') ;

statement
  : rem_statement  // Slurps up the rest of its line.
  | assignment_statement
  | call_statement
  | const_statement
  | deftype_statement
  | dim_statement
  | do_loop_statement
  | end_statement
  | exit_statement
  | for_next_statement
  | gosub_statement
  | goto_statement
  | if_inline_statement
  | print_statement
  | print_using_statement
  | return_statement
  | scope_statement
  | select_case_statement
  | while_wend_statement
// Statements can be empty after line labels, before or between :.
  |
  ;

// REM style comments start wherever a statement begins and consume the rest of
// the line. Because statements can only start in specific places, it is
// complicated to remove them with other comments in the lexer. We just include
// them in the parse tree and ignore them.
rem_statement
  : REM (~NL)*
  ;

declare_statement
  : DECLARE (SUB ID | FUNCTION typed_id) ('(' declare_parameter_list? ')')?
  ;

declare_parameter_list
  : declare_parameter (',' declare_parameter)*
  ;

declare_parameter
  : ID array_declaration? AS type_name_for_declare_parameter
  | typed_id array_declaration?
  ;

// DEF FNname is unusual because FNname is both a keyword and an identifier.
// Many rules can't match identifiers that start with FN, so we explicitly
// split FN-prefixed IDs out of ID into a separate FNID token.
//
// *** The IDE automatically corrects "DEF FN x" to "DEF FNx", so we'll also
// match a separate token form of DEF FN and merge that into FN+name later.
def_fn_statement
  : DEF (typed_fnid | FN typed_id) ('(' def_fn_parameter_list? ')')?
    ('=' expr
     | block
       END DEF)
  ;

def_fn_parameter_list
  : def_fn_parameter (',' def_fn_parameter)*
  ;

// DEF FN parameters can't be arrays, user-defined types, or fixed-length
// strings. (The QBasic help file incorrectly says user-defined types are
// allowed.)
def_fn_parameter
  : ID AS type_name_for_def_fn_parameter
  | typed_id
  ;

// IDE drops empty '()' parameter lists.
function_statement
  : FUNCTION typed_id ('(' parameter_list? ')')? STATIC?
    block
    end_function_statement
  ;

parameter_list
  : parameter (',' parameter)*
  ;

parameter
  : ID array_declaration? AS type_name_for_parameter
  | typed_id array_declaration?
  ;

// Earlier MS BASIC required you to specify the number of dimensions in array
// declarations, but QBasic doesn't.  The IDE erases the number of dimensions
// if it is specified.
array_declaration
  : '(' DIGITS? ')'
  ;

// Statements after END FUNCTION on the same line are silently dropped!
// program should consume the final NL or EOL.
end_function_statement
  : label? END FUNCTION (':' statement)*
  ;

if_block_statement
// Must have NL after THEN since otherwise this is an if_inline_statement.
  : IF expr THEN NL then_block
// ELSEIF, ELSE, and END IF must be the first statement on a line.
    elseif_block_statement*
    else_block_statement?
    end_if_statement
  ;

elseif_block_statement
  : label? ELSEIF expr THEN else_block
  ;

else_block_statement
  : label? ELSE else_block
  ;

// Statements after END IF will be part of the parent of if_block_statement.
end_if_statement
  : label? END IF
  ;

then_block
  : (label? (statement | if_block_statement) (':' statement)* NL)*
  ;

else_block
  : statement (':' statement)* NL
    (label? (statement | if_block_statement) (':' statement)* NL)*
  ;

// *** DIGITS must be 0 or 1, but that will be checked later.
option_statement
  : OPTION BASE DIGITS
  ;

// IDE drops empty '()' parameter lists.
sub_statement
  : SUB ID ('(' parameter_list? ')')? STATIC?
    block
    end_sub_statement
  ;

// Statements after END SUB on the same line are silently dropped!
// program should consume the final NL or EOL.
end_sub_statement
  : label? END SUB (':' statement)*
  ;

type_statement
// *** Note: type names cannot include '.'.
   : TYPE (ID | FNID) (':' | NL)+
// *** Types must have at least one type member.
     (rem_statement NL | type_member)+
     END TYPE
   ;

// Type members can't have labels etc. like normal lines.
type_member
   : (ID | FNID) AS type_name_for_type_member (':' | NL)+
   ;

assignment_statement
// The LET keyword is optional.
  : LET? typed_id args_or_indices? '=' expr
// This form is legal only inside a DEF FN, but we will use a semantic pass to
// enforce this later.  LET is also allowed here.
  | LET? typed_fnid '=' expr
  ;

// CALL can only be used with SUB procedures.
call_statement
// CALL sub or CALL sub(arg1, arg2, ... argN)
  : CALL ID ('(' call_argument_list ')')?
// If CALL is omitted, parens must also be omitted.
  | ID call_argument_list?
  ;

call_argument_list
  : call_argument (',' call_argument)*
  ;

call_argument
// Array variables must have () after their name, and are always passed by reference.
  : typed_id '(' ')'
// Non-parenthesized variables are passed by reference. Note this includes
// variables with array indices.
  | typed_id args_or_indices?
// Otherwise we can pass arbitrary expressions by value, including variables
// (by parenthesizing them).
  | expr
  ;

const_statement
  : CONST const_assignment (',' const_assignment)*
  ;

// Constants can have sigils, but they're not part of the name.
const_assignment
  : typed_id '=' const_expr
  ;

// TODO: Only a limited subset of expressions are supported here.
const_expr : expr ;

// DEFtype typing is a leftover from a previous MS BASIC.
deftype_statement
  : DEFINT letter_range (',' letter_range)*
  | DEFLNG letter_range (',' letter_range)*
  | DEFSNG letter_range (',' letter_range)*
  | DEFDBL letter_range (',' letter_range)*
  | DEFSTR letter_range (',' letter_range)*
  ;

// Supporting ranges like A-Z in the lexer is messy since that's also an
// expression.
//
// *** The IDE allows basically any typed_id or typed_fnid in ranges and strips
// down to the first letter, so we'll parse this liberally and deal with it
// later. Note that DEFINT fna-fnb turns into DEFINT a-b, so fn prefixes are
// evidently stripped.
letter_range: (typed_id | typed_fnid) ('-' (typed_id | typed_fnid))? ;

dim_statement
  : DIM SHARED? dim_variable (',' dim_variable)*
  | REDIM SHARED? dim_variable (',' dim_variable)*
  ;

dim_variable
// *** Variables of user-defined types cannot have names containing '.',
// probably to prevent member lookup ambiguity.
  : ID dim_array_bounds? AS type_name
  | typed_id dim_array_bounds?
  ;

dim_array_bounds
  : '(' dim_subscript (',' dim_subscript)* ')'
  ;

// expr must be some kind of vaguely integer type expression.
dim_subscript
  : (lower=expr TO)? upper=expr
  ;

do_loop_statement
  : (DO do_condition) block LOOP
  | DO block (LOOP do_condition)
  | DO block LOOP
  ;

do_condition
  : (WHILE expr | UNTIL expr)
  ;

end_statement
  : END
  ;

// *** This grammar allows EXIT anywhere, and leaves it up to a later pass to
// determine if it is legal at the current point in the program.
exit_statement
  : EXIT (DEF | DO | FOR | FUNCTION | SUB)
  ;

// FOR..NEXT is a totally reasonable for loop, except that multiple NEXTs can
// be combined into one statement using the syntax NEXT v1, v2, ... vN.
// TODO: Figure out how to parse NEXT v1, v2, ... vN.
for_next_statement
  : FOR typed_id '=' expr TO expr (STEP expr)?
    block
    NEXT typed_id?
  ;

gosub_statement
  : GOSUB (line_number | text_label)
  ;

// GOTO can't jump into or out of subroutines.
goto_statement
  : GOTO (line_number | text_label)
  ;

// Labels or line numbers must be distinct.
line_number : DIGITS ;
text_label : ID | FNID;

// IF has a concise inline form that can occur anywhere.
// The ELSE binds to the innermost IF.
if_inline_statement
  : IF expr THEN if_inline_action (ELSE if_inline_action)?
  ;

if_inline_action
  : statement (':' statement)*
  | line_number  // Implicit GOTO
  ;

// PRINT accepts an optional file handle and then zero or more expressions
// separated by a ',' or ';'. There can be a trailing ',' or ';' even if
// there is no other argument.
print_statement
  : PRINT (file_number ',')? print_args (',' | ';')?
  ;

print_args
  : expr
  | expr (',' | ';') print_args
  |
  ;

// PRINT USING must use ';' expression separators - the IDE auto-corrects
// ',' to ';'. The USING expr must be a format string, and must always be
// followed by ';'.
print_using_statement
  : PRINT (file_number ',')? USING expr ';' print_using_args ';'?
  ;

print_using_args
  : expr
  | expr ';' print_using_args
  |
  ;

// A file number can be any expression that evaluates to a valid file handle
file_number : '#' expr ;

// Return can optionally return anywhere. Awesome.
return_statement
  : RETURN (line_number | text_label)?
  ;

// SELECT CASE matches CASE statements at the top level, but not inside nested
// blocks (like nested IF...THEN).
select_case_statement
  : SELECT CASE expr before_first_case
    case_block*
    end_select_statement
  ;

// No real statements or labels are allowed before the first CASE.
before_first_case
  : (':' | rem_statement | NL)*
  ;

case_block
  : case_statement block
  ;

case_statement
  : CASE case_expr (',' case_expr)*
// CASE ELSE can occur anywhere in the SELECT body, even multiple times.
  | CASE ELSE
  ;
case_expr
  : IS ('<' | '<=' | '>' | '>=' | '<>' | '=') expr
  | expr TO expr
  | expr
  ;

end_select_statement
  : label? END SELECT
  ;

// COMMON, SHARED, and STATIC declare variable scopes using the same syntax.
// The syntax is similar to DIM but arrays aren't dimensioned.
scope_statement
  : COMMON SHARED? scope_variable (',' scope_variable)*
  | SHARED scope_variable (',' scope_variable)*
  | STATIC scope_variable (',' scope_variable)*
  ;

scope_variable
  : ID array_declaration? AS type_name
  | typed_id array_declaration?
  ;

// Loop construct from an older BASIC?
while_wend_statement
  : WHILE expr block WEND
  ;

expr
  : '(' expr ')'
  | expr '^' expr  // Unusually, ^ is left-associative.
// *** QBasic doesn't have unary plus, but the IDE accepts it and drops it.
  | '+' expr
  | '-' expr
  | expr ('*' | '/') expr
  | expr '\\' expr
  | expr MOD expr
  | expr ('+' | '-') expr
  | expr ('=' | '>' | '<' | '<>' | '<=' | '>=') expr
  | NOT expr
  | expr AND expr
  | expr OR expr
  | expr XOR expr
  | expr EQV expr
  | expr IMP expr
  | literal
// A variable with an array index is syntactically the same as a function call,
// so that has to be figured out by semantic analysis later.
// TODO: Consider adding call_argument_list here.
  | typed_id args_or_indices?
  ;

// Identifiers can optionally have type sigils appended.
// *** No space is allowed between a name and a type sigil, but it's easier to
// permit it and check later.
//
// Variable names can contain '.', which is also used to access members in user
// defined types. This creates an interesting ambiguity.
//
// TYPE record
// member AS INTEGER
// END TYPE
// DIM example AS record
// example.member = 42
// 'example.huh = 50 ' Error: Element not defined
// some.variable = 50 ' This is ok.
// 'DIM example.tricky AS record ' Error: Identifier cannot include period
//
// *** Member lookup is not part of this grammar at all, and '.' will be
// handled in symbol tables instead.
typed_id : ID ('!' | '#' | '$' | '%' | '&')? ;
typed_fnid : FNID ('!' | '#' | '$' | '%' | '&')? ;

// An argument list or set of array indices following an identifier,
// either an array lookup or a function call.
args_or_indices : '(' expr (',' expr)* ')';

// A system or user-defined type following an AS keyword.
type_name
  : INTEGER
  | LONG
  | SINGLE
  | DOUBLE
  | STRING
  | fixed_string
  | ID
  | FNID
  ;

// Can _only_ use variable-length strings in sub parameter lists.
type_name_for_parameter
  : INTEGER
  | LONG
  | SINGLE
  | DOUBLE
  | STRING
  | ID
  | FNID
  ;

// Can _only_ use variable-length strings in sub parameter lists.
type_name_for_declare_parameter
  : INTEGER
  | LONG
  | SINGLE
  | DOUBLE
  | STRING
  | ANY
  | ID
  | FNID
  ;

// See def_fn_parameter.
type_name_for_def_fn_parameter
  : INTEGER
  | LONG
  | SINGLE
  | DOUBLE
  | STRING
  ;

// Can only used fixed length strings, not variable-length strings in user-defined types.
type_name_for_type_member
  : INTEGER
  | LONG
  | SINGLE
  | DOUBLE
  | fixed_string
  | ID
  | FNID
  ;

// QBasic permits sizing a fixed string with a constant after '*'.  The IDE
// will remove any type sigils after the constant.
// *** If typed_id is not a constant, DIM errors with 'Invalid constant'.
// In TYPE definitions, fixed strings with non-constant dimensions parse, but
// trying to DIM things of the resulting TYPE hangs at runtime!
fixed_string
  : STRING '*' (DIGITS | typed_id)
  ;

literal
// If a floating point constant isn't explicitly marked as single or double and
// is representable in single precision, it will be single precision, otherwise
// double precision.
  : PROBABLY_SINGLE_PRECISION_NUMBER
  | DOUBLE_PRECISION_NUMBER
// The IDE has all kinds of behavior for integer constants.
// - Erases trailing %
// - Rejects out of range values as 'Illegal number'.
// - Strips whitespace between '-' and a number.
// - Strips unary '+' from expressions in general, not just numbers, so no
//   need to handle that here.
// - Strips leading zeros, so accept those.
  | (DIGITS | HEX | OCTAL) ('%' | '&')?
  | STRING_LITERAL
  ;
