// Based on MS-DOS QBasic 1.1
grammar qbasic;

// A program is one or more statements separated by ':' or NL, or EOF for the
// last statement in a program without a newline.
//
// An IF block must be the first statement on a line, so you cannot write "ELSE
// IF" instead of ELSEIF for example.  Ditto SUB.
//
// For simplicity, in this grammar SUB must go at the top level and can't nest.
// Technically though the IDE will move SUB in a nested if/loop to the top
// level at the end of the program, and unnests automatically if you start
// typing SUB inside another SUB.
//
// TODO: Support optional absent NL on last line in a less ugly way.
program
  : (label? (statement | if_block | sub_block | function_block | declare_statement | def_fn_statement) (':' statement | declare_statement | def_fn_statement)* NL)*
     label? (statement | if_block | sub_block | function_block | declare_statement | def_fn_statement) (':' statement | declare_statement | def_fn_statement)* EOF
  ;

// It's easier if we include the ':' as part of the label rule.
label
  : (line_number | text_label ':') ;

statement
  : rem_statement
  | assignment_statement
  | const_statement
  | deftype_statement
  | dim_statement
  | do_loop_statement
  | end_statement
  | for_next_statement
  | gosub_statement
  | goto_statement
  | if_inline_statement
  | lifetime_statement
  | print_statement
  | print_using_statement
  | return_statement
  | select_case_statement
  | type_statement
  | while_wend_statement
// Statements can be empty after line labels, before or between :.
  |
  ;

// REM style comments start wherever a statement begins and consume the rest of the line.
// We just include them in the parse tree and ignore them.
rem_statement
  : REM (~NL)*
  ;

// The LET keyword is optional.
assignment_statement
  : LET? variable '=' expr
  ;

const_statement
  : CONST const_assignment (',' const_assignment)*
  ;

// Constants can have sigils, but they're not part of the name.
const_assignment
  : variable '=' const_expr
  ;

// TODO: Only a limited subset of expressions are supported here.
const_expr : expr ;

// COMMON, SHARED, and STATIC declare variable lifetimes using the same syntax.
lifetime_statement
  : COMMON SHARED? decl_variable (',' decl_variable)*
  | SHARED decl_variable (',' decl_variable)*
  | STATIC decl_variable (',' decl_variable)*
  ;

decl_variable
  : ID decl_array_bounds? AS type_name
  | variable decl_array_bounds?
  ;

// Earlier MS BASIC required you to specify the number of dimensions in array
// declarations, but QBasic doesn't.  The IDE erases the number of dimensions
// if it is specified.
decl_array_bounds
  : '(' DIGITS? ')'
  ;

// DEFtype typing is a leftover from a previous MS BASIC.
deftype_statement
  : DEFINT letter_range (',' letter_range)*
  | DEFLNG letter_range (',' letter_range)*
  | DEFSNG letter_range (',' letter_range)*
  | DEFDBL letter_range (',' letter_range)*
  | DEFSTR letter_range (',' letter_range)*
  ;

// Supporting ranges like A-Z in the lexer is messy since that's also an
// expression.  The IDE allows any ID-ID in ranges and strips down to the first
// letter, so we'll parse that and deal with it later.
// Note that DEFINT fna-fnb turns into DEFINT a-b, so fn prefixes are evidently
// stripped.
letter_range: ID | ID '-' ID | FNID | FNID '-' FNID ;

// DIM can take a mix of "as" types and names with sigils.
dim_statement
  : DIM SHARED? dim_variable (',' dim_variable)*
  | REDIM SHARED? dim_variable (',' dim_variable)*
  ;

dim_variable
// Variables of user defined types cannot have names containing '.',
// probably to prevent member lookup ambiguity.
  : ID dim_array_bounds? AS type_name
  | variable dim_array_bounds?
  ;

dim_array_bounds
  : '(' dim_subscript (',' dim_subscript)* ')'
  ;

// expr must be some kind of vaguely integer type expression.
dim_subscript
  : (lower=expr TO)? upper=expr
  ;

// A system or user-defined type following an AS keyword.
type_name
  : INTEGER
  | LONG
  | SINGLE
  | DOUBLE
  | STRING
  | STRING '*' DIGITS
  | ID
  | FNID
  ;

// Can't use variable-length strings in user-defined types.
type_name_for_type_member
  : INTEGER
  | LONG
  | SINGLE
  | DOUBLE
  | STRING '*' DIGITS
  | ID
  | FNID
  ;

// Can _only_ use variable-length strings in sub parameter lists.
type_name_for_parameter_list
  : INTEGER
  | LONG
  | SINGLE
  | DOUBLE
  | STRING
  | ID
  | FNID
  ;

// DEF FN parameters can't be arrays, records, or fixed-length strings.
// The QBasic help file says user-defined types are allowed, but they aren't.
type_name_for_def_fn_parameter_list
  : INTEGER
  | LONG
  | SINGLE
  | DOUBLE
  | STRING
  ;

do_loop_statement
  : (DO do_condition) do_body_block LOOP
  | DO do_body_block (LOOP do_condition)
  | DO do_body_block LOOP
  ;

do_condition
  : (WHILE expr | UNTIL expr)
  ;

// Allow EXIT DO only inside DO loops.
do_body_statement
  : statement
  | EXIT DO
  ;

do_body_block
  : (':' do_body_statement)* ':'
  | (':' do_body_statement)* NL
    (label? (do_body_statement | if_block) (':' do_body_statement)* NL)*
// Match LOOP next in do_loop_statement, then match NL in the parent block.
    label? (do_body_statement | if_block) (':' do_body_statement)*
  ;

end_statement
  : END
  ;

// FOR..NEXT is a totally reasonable for loop, except that multiple NEXTs can
// be combined into one statement using the syntax NEXT v1, v2, ... vN.
// TODO: Figure out how to parse NEXT v1, v2, ... vN.
for_next_statement
// Single line loop.
  : for_assignment for_body_block NEXT variable?
  ;

for_assignment
  : FOR variable '=' expr TO expr (STEP expr)?
  ;

// Allow EXIT FOR only inside FOR..NEXT.
for_body_statement
  : statement
  | EXIT FOR
  ;

for_body_block
  : (':' for_body_statement)* ':'
  | (':' for_body_statement)* NL
    (label? (for_body_statement | if_block) (':' for_body_statement)* NL)*
// Match NEXT in for_loop_statement, then match NL in the parent block.
    label? (for_body_statement | if_block) (':' for_body_statement)*
  ;

// IDE drops empty '()' parameter lists.
function_block
  : FUNCTION variable ('(' parameter_list? ')')? STATIC?
    function_body_block
    end_function_statement
  ;

function_body_statement
  : statement
  | EXIT FUNCTION
  ;

function_body_block
  : (':' function_body_statement)* ':'
  | (':' function_body_statement)* NL
    (label? (function_body_statement | if_block) (':' function_body_statement)* NL)*
// Match END FUNCTION in function_block.
    label? (function_body_statement | if_block) (':' function_body_statement)*
  ;

// Statements after END FUNCTION on the same line are silently dropped!
// program should consume the final NL or EOL.
end_function_statement
  : label? END FUNCTION (':' statement)*
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

if_block
// Must have NL after THEN since otherwise this is an if_inline_statement.
  : IF expr THEN NL if_body_block
// ELSEIF, ELSE, and END IF must be the first statement on a line.
    elseif_block*
    else_block?
    end_if_statement
  ;

elseif_block
  : label? ELSEIF expr THEN midline_if_body_block
  ;

else_block
  : label? ELSE midline_if_body_block
  ;

// Statements after END IF will be part of the parent of if_block.
end_if_statement
  : label? END IF
  ;

if_body_block
  : (label? (statement | if_block) (':' statement)* NL)*
  ;

midline_if_body_block
  : statement (':' statement)* NL
    (label? (statement | if_block) (':' statement)* NL)*
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
  : case_statement
   ((':' statement)* ':'
    |
    (':' statement)* NL
    (label? (statement | if_block) (':' statement)* NL)*
// Match CASE or END SELECT next in select_case_statement, then match NL in the parent block.
    label? (statement | if_block) (':' statement)*
   )
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

parameter_list
  : parameter (',' parameter)*
  ;

parameter
  : ID parameter_array_bounds? AS type_name_for_parameter_list
  | variable parameter_array_bounds?
  ;

// See decl_array_bounds.
parameter_array_bounds
  : '(' DIGITS? ')'
  ;

// IDE drops empty '()' parameter lists.
sub_block
  : SUB ID ('(' parameter_list? ')')? STATIC?
    sub_body_block
    end_sub_statement
  ;

sub_body_statement
  : statement
  | EXIT SUB
  ;

sub_body_block
  : (':' sub_body_statement)* ':'
  | (':' sub_body_statement)* NL
    (label? (sub_body_statement | if_block) (':' sub_body_statement)* NL)*
// Match END SUB in sub_block.
    label? (sub_body_statement | if_block) (':' sub_body_statement)*
  ;

// Statements after END SUB on the same line are silently dropped!
// program should consume the final NL or EOL.
end_sub_statement
  : label? END SUB (':' statement)*
  ;

// IDE drops empty '()' parameter lists.
declare_statement
  : DECLARE (SUB ID | FUNCTION variable) ('(' parameter_list? ')')?
  ;

// DEF FNname is unusual because FNname is both a keyword and an identifier.
// Many rules that match identifiers like variables, procedure names, and
// parameter names also can't start with FN, so we model this by explicitly
// splitting FN-prefixed IDs out of ID into a separate FNID token.
//
// The IDE automatically corrects "DEF FN x" to "DEF FNx", so we'll also match
// a separate token form of DEF FN and merge that into FN+name later.
def_fn_statement
  : DEF (FNID | FN ID) ('(' def_fn_parameter_list? ')')?
    ('=' expr |
    def_fn_body_block
    END DEF)
  ;

def_fn_parameter_list
  : def_fn_parameter (',' def_fn_parameter)*
  ;

def_fn_parameter
  : ID AS type_name_for_def_fn_parameter_list
  | variable
  ;

// FNID can only be assigned inside a DEF FN - we'll check elsewhere that this
// is the same FNID.  This accepts optional LET like other assignments.
def_fn_assignment_statement
  : LET? FNID '=' expr
  ;

def_fn_body_statement
  : statement
  | def_fn_assignment_statement
  | EXIT DEF
  ;

def_fn_body_block
  : (':' def_fn_body_statement)* ':'
  | (':' def_fn_body_statement)* NL
    (label? (def_fn_body_statement | if_block) (':' def_fn_body_statement)* NL)*
// Match END DEF in def_fn_statement.
    label? (def_fn_body_statement | if_block) (':' def_fn_body_statement)*
  ;

// User defined types must contain at least one member.
// TODO: type cannot occur in procedure or DEF FN.
type_statement
// Note: type names cannot include '.'.
   : TYPE (ID | FNID) NL+ type_member+ END TYPE
   ;

// Type members can't have labels etc. like normal lines.
type_member
// Note: type members cannot include '.'.
   : (ID | FNID) AS type_name_for_type_member NL+
// Since we handle REM comments as statements, need to accept them here.
   | rem_statement NL
   ;

// Loop construct from an older BASIC?
while_wend_statement
  : WHILE expr while_body_block WEND
  ;

while_body_block
  : (':' statement)* ':'
  | (':' statement)* NL
    (label? (statement | if_block) (':' statement)* NL)*
// Match WEND in while_wend_statement, then match NL in the parent block.
    label? (statement | if_block) (':' statement)*
  ;

expr
  : literal
  | variable
  ;

// Variables can have type sigils appended.
// No space is allowed before a sigil, but it's easier to permit it and check later.
//
// Variable names can contain '.', which is also used to access fields in user
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
// Field lookup is not part of this grammar at all, and will be handled in
// symbol tables instead.
variable : ID ('!' | '#' | '$' | '%' | '&')? ;

literal
// If a floating point constant isn't explicitly marked as single or double and
// is representable in single precision, it will be single precision, otherwise
// double precision.
  : '-'? PROBABLY_SINGLE_PRECISION_NUMBER
  | '-'? DOUBLE_PRECISION_NUMBER
// The IDE has all kinds of behavior for integer constants.
// - Erases trailing %
// - Rejects out of range values as 'Illegal number'.
// - Strips whitespace between '-' and a number.
// - Strips unary '+' from expressions in general, not just numbers, so no
//   need to handle that here.
// - Strips leading zeros, so accept those.
  | ('-'? DIGITS | HEX | OCTAL) ('%' | '&')?
  | STRING_LITERAL
  ;

// Literals
DIGITS : [0-9]+ ;
HEX : '&' [hH] [0-9a-fA-F]+ ;
OCTAL : '&' [oO] [0-7]+ ;
PROBABLY_SINGLE_PRECISION_NUMBER
// The IDE expands scientific notation into '!' decimals for numbers
// with 6 or fewer digits, but the language accepts exponents.
  : [0-9]+ '.' [0-9]* E_EXPONENT? '!'?
  | '.' [0-9]+ E_EXPONENT? '!'?
  | [0-9]+ E_EXPONENT '!'?
  | [0-9]+ '!'
  ;
fragment
E_EXPONENT : [eE] [-+]? [0-9]+ ;
// If a decimal number has a 'd' exponent or a '#' it's a double.
DOUBLE_PRECISION_NUMBER
  : [0-9]+ '.' [0-9]* (D_EXPONENT | '#')
  | '.' [0-9]+ (D_EXPONENT | '#')
  | [0-9]+ (D_EXPONENT | '#')
  ;
fragment
D_EXPONENT : [dD] [-+]? [0-9]+ '#'?;
STRING_LITERAL : '"' ~["\r\n]* '"' ;

// Keywords
AS : [Aa][Ss] ;
CASE : [Cc][Aa][Ss][Ee] ;
COMMON : [Cc][Oo][Mm][Mm][Oo][Nn] ;
CONST : [Cc][Oo][Nn][Ss][Tt] ;
DECLARE : [Dd][Ee][Cc][Ll][Aa][Rr][Ee] ;
DEF : [Dd][Ee][Ff] ;
DEFDBL : [Dd][Ee][Ff][Dd][Bb][Ll] ;
DEFINT : [Dd][Ee][Ff][Ii][Nn][Tt] ;
DEFLNG : [Dd][Ee][Ff][Ll][Nn][Gg] ;
DEFSNG : [Dd][Ee][Ff][Ss][Nn][Gg] ;
DEFSTR : [Dd][Ee][Ff][Ss][Tt][Rr] ;
DIM : [Dd][Ii][Mm] ;
DO : [Dd][Oo] ;
DOUBLE : [Dd][Oo][Uu][Bb][Ll][Ee] ;
ELSE : [Ee][Ll][Ss][Ee] ;
ELSEIF : [Ee][Ll][Ss][Ee][Ii][Ff] ;
END : [Ee][Nn][Dd] ;
EXIT : [Ee][Xx][Ii][Tt] ;
FOR : [Ff][Oo][Rr] ;
FN : [Ff][Nn] ;
FUNCTION : [Ff][Uu][Nn][Cc][Tt][Ii][Oo][Nn] ;
GOSUB : [Gg][Oo][Ss][Uu][Bb] ;
GOTO : [Gg][Oo][Tt][Oo] ;
IF : [Ii][Ff] ;
IS : [Ii][Ss] ;
INTEGER : [Ii][Nn][Tt][Ee][Gg][Ee][Rr] ;
LET : [Ll][Ee][Tt] ;
LONG : [Ll][Oo][Nn][Gg] ;
LOOP : [Ll][Oo][Oo][Pp] ;
NEXT : [Nn][Ee][Xx][Tt] ;
PRINT : [Pp][Rr][Ii][Nn][Tt] ;
REDIM : [Rr][Ee][Dd][Ii][Mm] ;
REM : [Rr][Ee][Mm] ;
RETURN : [Rr][Ee][Tt][Uu][Rr][Nn] ;
SELECT : [Ss][Ee][Ll][Ee][Cc][Tt] ;
SHARED : [Ss][Hh][Aa][Rr][Ee][Dd] ;
SINGLE : [Ss][Ii][Nn][Gg][Ll][Ee] ;
STATIC : [Ss][Tt][Aa][Tt][Ii][Cc] ;
STEP : [Ss][Tt][Ee][Pp] ;
STRING : [Ss][Tt][Rr][Ii][Nn][Gg] ;
SUB : [Ss][Uu][Bb];
THEN : [Tt][Hh][Ee][Nn] ;
TO : [Tt][Oo] ;
TYPE : [Tt][Yy][Pp][Ee] ;
UNTIL : [Uu][Nn][Tt][Ii][Ll] ;
USING : [Uu][Ss][Ii][Nn][Gg] ;
WEND : [Ww][Ee][Nn][Dd] ;
WHILE : [Ww][Hh][Ii][Ll][Ee] ;

// IDs prefixed with FN are special cased as user defined functions and not
// allowed in many places where IDs are allowed.
FNID : [Ff][Nn][A-Za-z][A-Za-z0-9.]* ;
// ID matches identifier names not starting with FN.
ID : [A-EG-Za-eg-z][A-Za-z0-9.]*
   | [Ff][A-MO-Za-mo-z][A-Za-z0-9.]*
   | [Ff]
   ;

NL : '\r'? '\n' ;
// Note: We skip ' comments here, but REM comments are parsed as statements.
COMMENT : '\'' ~[\r\n]* '\r'? '\n' -> skip;
WS : [ \t]+ -> skip ;