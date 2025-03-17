// Based on MS-DOS QBasic 1.1
//
// This grammar avoids antlr4 semantic predicates and sticks to language
// neutral notation, and so it relies on subsequent analysis to detect some
// kinds of syntax issues.  These are noted with *** in comments.
//
// Where possible, literal symbols like '+' are used instead of named tokens
// like PLUS for legibility.  But QBasic's lexical grammar has many quirks,
// e.g. DATA statements use CSV-like syntax.  So a couple tokens like ':' and
// ',' have to be aliased for different lexical modes, and must be named.
parser grammar QBasicParser;
options {
  tokenVocab = QBasicLexer;
}

// A program is one or more statements separated by ':' or NL.
// *** The QBasic IDE adds NL to the last line if it is missing, so callers
// should make sure to do this.
//
// Formally, some statements are only allowed at the top level of the program,
// and procedures can't nest. The IDE tries to fix problems: it will move SUB
// out from an IF or DO block, and unnests automatically if you start typing
// SUB inside another SUB (though it errors if you load a program with a nested
// SUB...END SUB). For simplicity, this grammar only allows SUBs at the top
// level and errors on SUBs nested anywhere.
//
// *** DECLARE and COMMON have to come before other statements.  This is easier
// to check outside this grammar.
//
// Some statements must be the first statement on a line, like the block form
// of IF (so you can't write "ELSE IF" instead of ELSEIF for example).  This is
// a real restriction that QBasic enforces.
program
  // Any line can begin with a label, but labels on FUNCTION or SUB are bound
  // within the procedure body and not the program toplevel so are matched
  // within those statements.
	: (( label? statement?
     | label? declare_statement
     | label? def_fn_statement
     | function_statement
     | label? if_block_statement
     | label? option_statement
     | sub_statement
     | label? type_statement)
      (COLON ( statement?
             | declare_statement
             | def_fn_statement
             | option_statement
             | type_statement))* NL)*
    EOF
  ;

// block matches statements in the body of loops, procedures, and conditionals.
// It does not allow some statements only allowed at the top level.
block
// blocks can go on one line, like START : block : END
  : (COLON statement?)* COLON
// blocks can also span many lines, like
// START: {block...
// ...
// ...}: END
  | (COLON statement?)* NL
    (label? (statement? | if_block_statement) (COLON statement?)* NL)*
// Match block ending keyword in the parent statement, then match NL in the
// parent block or program.  Match a label first on the last partial line so
// that we prefer "label: (END)" instead of "call label ':' (END)".
    ( label?
    | label? (statement? | if_block_statement) (COLON statement?)* COLON)
  ;

// Used to define labels.
label
  : (line_number | text_label COLON) ;

// Used to reference labels.
target
  : line_number
  | text_label
  ;
implicit_goto_target
  : line_number
  ;

// QBasic recognizes line numbers up to 40 digits long, suggesting even numeric
// labels are just a relaxed case of IDs.  This grammar doesn't impose a limit.
// *** Labels or line numbers must be globally distinct.
line_number : DIGITS ;
text_label : untyped_id | untyped_fnid;

// Many statements are parsed as calls to builtin procedures.  This is just the
// set of statements that need special parsing.
statement
  : assignment_statement
  | call_statement
  | call_absolute_statement
  | circle_statement
  | clear_statement
  | close_statement
  | color_statement
  | common_statement
  | const_statement
  | data_statement
  | def_seg_statement
  | deftype_statement
  | dim_statement
  | do_loop_statement
  | dynamic_metacommand
  | end_statement
  | erase_statement
  | error_statement
  | event_control_statement
  | exit_statement
  | field_statement
  | for_next_statement
  | get_graphics_statement
  | get_io_statement
  | gosub_statement
  | goto_statement
  | if_inline_statement
  | include_metacommand
  | input_statement
  | input_file_statement
  | ioctl_statement
  | key_statement
  | line_statement
  | line_input_statement
  | line_input_file_statement
  | locate_statement
  | lock_statement
  | lprint_statement
  | lprint_using_statement
  | lset_statement
  | mid_statement
  | name_statement
  | on_error_statement
  | on_event_gosub_statement
  | on_expr_gosub_statement
  | on_expr_goto_statement
  | open_statement
  | open_legacy_statement
  | paint_statement
  | palette_statement
  | play_statement
  | preset_statement
  | print_statement
  | print_using_statement
  | pset_statement
  | put_graphics_statement
  | put_io_statement
  | read_statement
  | restore_statement
  | resume_statement
  | return_statement
  | rset_statement
  | screen_statement
  | seek_statement
  | select_case_statement
  | shared_statement
  | static_metacommand
  | static_statement
  | stop_statement
  | unlock_statement
  | view_statement
  | view_print_statement
  | while_wend_statement
  | width_statement
  | window_statement
  | write_statement
  ;

declare_statement
  : DECLARE (SUB untyped_id | FUNCTION ID) ('(' declare_parameter_list? ')')?
  ;

declare_parameter_list
  : declare_parameter (COMMA declare_parameter)*
  ;

declare_parameter
  : untyped_id array_declaration? AS type_name_for_declare_parameter
  | ID array_declaration?
  ;

// DEF FNname is unusual because FNname is both a keyword and an identifier.
// Many rules can't match identifiers that start with FN, so we explicitly
// split FN-prefixed IDs out of ID into a separate FNID token.
//
// Note that unlike functions, DEF FNs may differ only in return type, so FNfoo$
// and FNfoo% are different.
//
// *** The IDE automatically corrects "DEF FN x" to "DEF FNx", so we'll also
// match a separate token form of DEF FN and merge that into FN+name later.
def_fn_statement
  : DEF (name=FNID | FN name=ID) ('(' def_fn_parameter_list? ')')?
    ('=' expr
     | block
       END DEF)
  ;

def_fn_parameter_list
  : def_fn_parameter (COMMA def_fn_parameter)*
  ;

// DEF FN parameters can't be arrays, user-defined types, or fixed-length
// strings. (The QBasic help file incorrectly says user-defined types are
// allowed.)
def_fn_parameter
  : untyped_id AS type_name_for_def_fn_parameter
  | ID
  ;

// The IDE drops empty '()' parameter lists, so admit that.
function_statement
  : label? FUNCTION ID ('(' parameter_list? ')')? STATIC?
    block
    end_function_statement
  ;

parameter_list
  : parameter (COMMA parameter)*
  ;

parameter
  : untyped_id array_declaration? AS type_name_for_parameter
  | ID array_declaration?
  ;

// Earlier MS BASIC required you to specify the number of dimensions in array
// declarations, but QBasic doesn't.  The IDE erases the number of dimensions
// if it is specified.
array_declaration
  : '(' DIGITS? ')'
  ;
// But the SHARED statement doesn't support optional array dimensions (it's
// newer).
array_declaration_no_dimensions
  : '(' ')'
  ;

// Statements after END FUNCTION on the same line are silently dropped!
// program should consume the final NL or EOL.
// *** Ignore any extra statements here.
end_function_statement
  : label? END FUNCTION (COLON statement?)*
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
  : (label? (statement? | if_block_statement) (COLON statement?)* NL)*
  ;

else_block
  : statement? (COLON statement?)* NL
    (label? (statement? | if_block_statement) (COLON statement?)* NL)*
  ;

// *** DIGITS must be 0 or 1, but that will be checked later.
option_statement
  : OPTION BASE DIGITS
  ;

// The IDE drops empty '()' parameter lists, so admit that.
sub_statement
  : label? SUB name=untyped_id ('(' parameter_list? ')')? STATIC?
    block
    end_sub_statement
  ;

// Statements after END SUB on the same line are silently dropped!
// program should consume the final NL or EOL.
// *** Ignore any extra statements here.
end_sub_statement
  : label? END SUB (COLON statement?)*
  ;

type_statement
// *** Note: type names cannot include '.'.
   : TYPE (untyped_id | untyped_fnid) (COLON | NL)+
// *** Types must have at least one element.
// We admit empty types here so we can provide a better error message than
// antlr's default.
     type_element*
     END TYPE
   ;

// Type elements can't have labels etc. like normal lines.
type_element
   : (untyped_id | untyped_fnid) AS type_name_for_type_element (COLON | NL)+
   ;

assignment_statement
// The LET keyword is optional.
// *** Assignment to a FNID is only legal inside DEF FNname body.
  : LET? variable_or_function_call '=' expr
  ;

// CALL can only be used with SUB procedures.
call_statement
// CALL sub or CALL sub(arg1, arg2, ... argN)
  : CALL untyped_id ('(' argument_list ')')?
// If CALL is omitted, parens must also be omitted.
// Many statements are parsed into this implicit CALL syntax.
  | untyped_id argument_list?
  ;

call_absolute_statement
  : CALL ABSOLUTE '(' (call_absolute_argument_list COMMA)? expr ')'
  ;

call_absolute_argument_list
  : expr (COMMA expr)*
  ;

// Erase needs to be parsed specially because if it were an implicit builtin
// call, its array arguments would be bound to default scalar variables.
erase_statement
  : ERASE ID (COMMA ID)*
  ;

error_statement
  : ERROR expr
  ;

event_control_statement
  : COM '(' expr ')' (ON | OFF | STOP)
  | KEY '(' expr ')' (ON | OFF | STOP)
  | PEN (ON | OFF | STOP)
  | PLAY (ON | OFF | STOP)
  | STRIG '(' expr ')' (ON | OFF | STOP)
  | TIMER (ON | OFF | STOP)
  ;

circle_statement
  : CIRCLE STEP? '(' x=expr COMMA y=expr ')' COMMA radius=expr
    ( COMMA (color=expr)? COMMA (start=expr)? COMMA (end=expr)? COMMA aspect=expr
    | COMMA (color=expr)? COMMA (start=expr)? COMMA end=expr
    | COMMA (color=expr)? COMMA start=expr
// The IDE removes a single final comma with no other arguments.
    | COMMA (color=expr)? )?
  ;    

// The help file only mentions CLEAR [,,stack] but the language seems to accept
// two optional arguments.
clear_statement
  : CLEAR expr?
  | CLEAR expr? COMMA expr
  | CLEAR expr? COMMA expr? COMMA stacksize=expr
  ;

close_statement
  : CLOSE ('#'? expr)? (COMMA '#'? expr)*
  ;

color_statement
  : COLOR
    ( (arg1=expr)? COMMA (arg2=expr)? COMMA (arg3=expr)
    | (arg1=expr)? COMMA (arg2=expr)
    | (arg1=expr)? )
  ;

common_statement
  : COMMON SHARED? block_name? scope_variable (COMMA scope_variable)*
  ;

// The QBasic help file doesn't mention this, but it still parses this
// QuickBasic syntax.
block_name
  : '/' ID? '/'
  ;

scope_variable
  : untyped_id array_declaration? AS type_name
  | ID array_declaration?
  ;

shared_variable
  : untyped_id array_declaration_no_dimensions? AS type_name
  | ID array_declaration_no_dimensions?
  ;

const_statement
  : CONST const_assignment (COMMA const_assignment)*
  ;

// Constants can have sigils, but they're not part of the name.
const_assignment
  : ID '=' const_expr
  ;

// *** Only a limited subset of expressions are valid for constant arithmetic.
// This is simpler to deal with outside the grammar.
const_expr : expr ;

// The IDE complains if you type a DATA statement inside a SUB or FUNCTION, but
// qbasic /run will quietly move any such statements out to the top level.  So
// we allow DATA statements anywhere.
data_statement
  : DATA data_item (DATA_COMMA data_item)*
  ;

data_item
  : DATA_QUOTED
  | DATA_UNQUOTED
  |  // Empty items are allowed e.g. DATA 1,,2
  ;

def_seg_statement
  : DEF SEG ('=' expr)?;

// DEFtype typing is a leftover from a previous MS BASIC.
deftype_statement
  : DEFINT letter_range (COMMA letter_range)*
  | DEFLNG letter_range (COMMA letter_range)*
  | DEFSNG letter_range (COMMA letter_range)*
  | DEFDBL letter_range (COMMA letter_range)*
  | DEFSTR letter_range (COMMA letter_range)*
  ;

// Supporting ranges like A-Z in the lexer is messy since that's also an
// expression.
//
// *** The IDE allows basically any ID or FNID in ranges and strips
// down to the first letter, so we'll parse this liberally and deal with it
// later. Note that DEFINT fna-fnb turns into DEFINT a-b, so fn prefixes are
// evidently stripped.
letter_range: first=(ID | FNID) ('-' second=(ID | FNID))? ;

// *** SHARED is illegal in procedures or def fns.
dim_statement
  : DIM SHARED? dim_variable (COMMA dim_variable)*
  | REDIM SHARED? dim_variable (COMMA dim_variable)*
  ;

dim_variable
// *** Variables of user-defined types cannot have names containing '.',
// probably to prevent element lookup ambiguity.
  : untyped_id dim_array_bounds? AS type_name
  | ID dim_array_bounds?
  ;

dim_array_bounds
  : '(' dim_subscript (COMMA dim_subscript)* ')'
  ;

// expr must be some kind of vaguely integer type expression.
dim_subscript
  : (lower=expr TO)? upper=expr
  ;

do_loop_statement
  : (DO do_condition) block LOOP
  | DO block (LOOP loop_condition)
  | DO block LOOP
  ;

do_condition
  : (WHILE expr | UNTIL expr)
  ;

loop_condition
  : (WHILE expr | UNTIL expr)
  ;

dynamic_metacommand : COMMENT_META_DYNAMIC ;

end_statement
  : END
  ;

// *** This grammar allows EXIT anywhere, and leaves it up to a later pass to
// determine if it is legal at the current point in the program.
exit_statement
  : EXIT (DEF | DO | FOR | FUNCTION | SUB)
  ;

field_statement
  : FIELD '#'? expr COMMA field_assignment (COMMA field_assignment)*
  ;

field_assignment
  : expr AS variable_or_function_call
  ;

// FOR...NEXT is a totally reasonable for loop, except that multiple NEXTs can
// be combined into one statement using the syntax NEXT v1, v2, ... vN.  That
// is handled in the lexer by a special mode just for NEXT statements that
// turns ',' into NEXT_WITH_MANDATORY_ID.
for_next_statement
  : FOR ID '=' start=expr TO end=expr (STEP increment=expr)?
    ( block (NEXT ID? | NEXT_WITH_MANDATORY_ID ID)
    // NEXT_WITH_MANDATORY_ID counts as a statement separator to close the block.
    | (COLON statement?)* (COLON for_next_statement) NEXT_WITH_MANDATORY_ID ID
    | ((COLON statement?)* NL
       (label? (statement? | if_block_statement) (COLON statement?)* NL)*
       ( label?
       | label? for_next_statement (NEXT_WITH_MANDATORY_ID ID)
       | label? (statement? | if_block_statement) (COLON statement?)*
         (COLON for_next_statement) (NEXT_WITH_MANDATORY_ID ID))))
  ;

get_graphics_statement
  : GET STEP? '(' x1=expr COMMA y1=expr ')' '-'
        STEP? '(' x2=expr COMMA y2=expr ')'
    COMMA arrayname=variable_or_function_call
  ;

get_io_statement
  : GET '#'? expr (COMMA expr? (COMMA variable_or_function_call)?)?
  ;

gosub_statement
  : GOSUB target
  ;

// GOTO can't jump into or out of subroutines.
goto_statement
  : GOTO target
  ;

// IF has a concise inline form that can occur anywhere.
// The ELSE binds to the innermost IF.
if_inline_statement
  : IF expr THEN if_inline_action if_inline_else_statement?
// QBasic still parses this old BASICA/GW-BASIC syntax omitting THEN.
  | IF expr goto_statement if_inline_else_statement?
  ;

if_inline_else_statement
  : ELSE if_inline_action
  ;

if_inline_action
  : statement (COLON statement?)*
  | implicit_goto_target
  ;

include_metacommand : COMMENT_META_INCLUDE ;

// The IDE does not seem to automatically insert missing ','s for INPUT the way
// it does for PRINT statements.
input_statement
  : INPUT sameline=';'?
    (prompt=STRING_LITERAL mark=(';' | COMMA))?
    variable_or_function_call (COMMA variable_or_function_call)*
  ;

input_file_statement
  : INPUT file_number COMMA
    variable_or_function_call (COMMA variable_or_function_call)*
  ;

ioctl_statement
  : IOCTL '#'? expr COMMA expr
  ;

key_statement
  : KEY LIST
  | KEY (ON | OFF)
  | KEY expr COMMA expr
  ;

line_statement
  : LINE (STEP? '(' x1=expr COMMA y1=expr ')')? '-'
         STEP? '(' x2=expr COMMA y2=expr ')'
    ( COMMA (color=expr)? COMMA (box=box_style)? COMMA style=expr
    | COMMA (color=expr)? COMMA box=box_style
// The IDE will erase a trailing comma after color.
// Strangely, the IDE will also erase two trailing commas, and just one.
    | COMMA (color=expr)? COMMA? )?
  ;

// Box style constants aren't keywords, they're valid identifiers.  It's easier
// to parse them as IDs and check for valid values later.
box_style
  : ID  // *** Must be B or BF.
  ;

line_input_statement
  : LINE INPUT sameline=';'?
    (prompt=STRING_LITERAL mark=(';' | COMMA))?
    variable_or_function_call
  ;

line_input_file_statement
  : LINE INPUT file_number COMMA variable_or_function_call
  ;

locate_statement
  : LOCATE 
    ( (row=expr)? COMMA (column=expr)? COMMA (cursor=expr)? COMMA (start=expr)? COMMA stop=expr
    | (row=expr)? COMMA (column=expr)? COMMA (cursor=expr)? COMMA start=expr
    | (row=expr)? COMMA (column=expr)? COMMA cursor=expr
    | (row=expr)? COMMA column=expr
    | (row=expr) )?
  ;

lock_statement
  : LOCK '#'? expr (COMMA (expr | expr TO expr))?
  ;

lprint_statement
  : LPRINT print_argument*
  ;

// See note for PRINT USING for comma handling.
lprint_using_statement
  : LPRINT USING format=expr ';' print_argument*
  ;

lset_statement
  : LSET variable_or_function_call '=' expr
  ;

mid_statement
  : MID_STRING '(' variable_or_function_call COMMA start=expr (COMMA length=expr)? ')' '=' string=expr
  ;

name_statement
  : NAME oldpath=expr AS newpath=expr
  ;

on_error_statement
  : ON ERROR (GOTO target | RESUME NEXT)
  ;

on_event_gosub_statement
  : ON COM '(' expr ')' GOSUB target
  | ON KEY '(' expr ')' GOSUB target
  | ON PEN GOSUB target
  | ON PLAY '(' expr ')' GOSUB target
  | ON STRIG '(' expr ')' GOSUB target
  | ON TIMER '(' expr ')' GOSUB target
  ;

on_expr_gosub_statement
  : ON expr GOSUB target (COMMA target)*
  ;

on_expr_goto_statement
  : ON expr GOTO target (COMMA target)*
  ;

open_legacy_statement
  : OPEN openmode=expr COMMA '#'? filenum=expr COMMA file=expr (COMMA reclen=expr)?
  ;

open_statement
  : OPEN file=expr (FOR open_mode)? (ACCESS open_access)? open_lock? AS ('#'? filenum=expr) (LEN '=' reclen=expr)?
  ;

open_mode
  : OUTPUT | INPUT | APPEND | RANDOM | BINARY
  ;

open_access
  : READ | WRITE | READ WRITE
  ;

open_lock
  : SHARED
  | LOCK READ
  | LOCK WRITE
  | LOCK READ WRITE
  ;

// PAINT fails at runtime if you pass background without also passing tile, but
// that parses just fine.
paint_statement
  : PAINT STEP? '(' x=expr COMMA y=expr ')'
    ( COMMA (color_tile=expr)? COMMA (bordercolor=expr)? COMMA background=expr
    | COMMA (color_tile=expr)? COMMA bordercolor=expr
    | COMMA color_tile=expr )?
  ;

palette_statement
  : PALETTE attribute=expr COMMA color=expr
  | PALETTE USING arrayname=variable_or_function_call
  | PALETTE
  ;

play_statement
  : PLAY expr
  ;

preset_statement
  : PRESET STEP? '(' x=expr COMMA y=expr ')' (COMMA color=expr)?
  ;

// PRINT accepts an optional file handle and then zero or more expressions
// separated by a ',' or ';'. There can be a trailing ',' or ';' even if
// there is no other argument.  The IDE inserts a ';' between expressions that
// have no separator.
print_statement
  : PRINT (file_number COMMA)? print_argument*
  ;

// PRINT USING must use ';' expression separators - the IDE auto-corrects
// ',' to ';'. The USING expr must be a format string, and must always be
// followed by ';'.  The IDE inserts a ';' between expressions that have no
// separator.
print_using_statement
  : PRINT (file_number COMMA)? USING format=expr ';' print_argument*
  ;

print_argument
  : ( arg=expr separator=(COMMA | ';')?
// The SPC function is only valid inside the print argument list.
    | SPC '(' spaces=expr ')' separator=(COMMA | ';')?
// Ditto TAB.
    | TAB '(' tab=expr ')' separator=(COMMA | ';')?
// Expressions can be empty e.g. just "PRINT ;"
    | separator=(COMMA | ';')
    )
  ;

pset_statement
  : PSET STEP? '(' x=expr COMMA y=expr ')' (COMMA color=expr)?
  ;

put_graphics_statement
  : PUT STEP? '(' x1=expr COMMA y1=expr ')'
    COMMA arrayname=variable_or_function_call
    (COMMA (AND | OR | PSET | PRESET | XOR))?
  ;

put_io_statement
  : PUT '#'? expr (COMMA expr? (COMMA variable_or_function_call)?)?
  ;

read_statement
  : READ variable_or_function_call (COMMA variable_or_function_call)*
  ;

restore_statement
  : RESTORE target?
  ;

// A special kind of return statement just for ON ERROR handlers.
// *** RESUME is illegal inside procedures or def fns.
resume_statement
  : RESUME (NEXT | target)?;

// Return can optionally return anywhere. Awesome.
return_statement
  : RETURN target?
  ;

rset_statement
  : RSET variable_or_function_call '=' expr
  ;

screen_statement
  : SCREEN screenmode=expr
    ( COMMA (colorswitch=expr)? COMMA (activepage=expr)? COMMA visualpage=expr
    | COMMA (colorswitch=expr)? COMMA activepage=expr
    | COMMA colorswitch=expr )?
  ;

seek_statement
  : SEEK '#'? expr COMMA expr
  ;

// SELECT CASE matches CASE statements at the top level, but not inside nested
// blocks (like nested IF...THEN).
select_case_statement
  : SELECT CASE expr before_first_case
    case_block*
    end_select_statement
  ;

// No statements or labels are allowed before the first CASE.
before_first_case
  : (COLON | NL)*
  ;

case_block
  : case_statement block
  ;

// Labels before case statements are part of the preceding case block.
case_statement
  : CASE case_expr (COMMA case_expr)*
// CASE ELSE can occur anywhere in the SELECT body, even multiple times.
  | CASE ELSE
  ;
case_expr
  : IS op=('<' | '<=' | '>' | '>=' | '<>' | '=') other=expr
  | lower=expr TO upper=expr
  | equal=expr
  ;

end_select_statement
  : label? END SELECT
  ;

// *** SHARED is illegal outside a sub or function.
shared_statement
  : SHARED shared_variable (COMMA shared_variable)*
  ;

// *** STATIC is illegal outside a sub, function, or def fn.
static_statement
  : STATIC scope_variable (COMMA scope_variable)*
  ;

static_metacommand : COMMENT_META_STATIC ;

stop_statement
  : STOP
  ;

unlock_statement
  : UNLOCK '#'? expr (COMMA (expr | expr TO expr))?
  ;

view_statement
  : VIEW
  | VIEW SCREEN? '(' x1=expr COMMA y1=expr ')' '-' '(' x2=expr COMMA y2=expr')'
    ( COMMA (color=expr)? COMMA border=expr
    | COMMA color=expr )?
  ;

view_print_statement
  : VIEW PRINT (toprow=expr TO bottomrow=expr)?
  ;

// Loop construct from an older BASIC?
while_wend_statement
  : WHILE expr block WEND
  ;

width_statement
  : WIDTH columns=expr
  | WIDTH COMMA lines=expr
  | WIDTH expr COMMA expr  // Could be WIDTH device$, width or WIDTH columns, lines
  | WIDTH file_number COMMA width=expr
  | WIDTH LPRINT width=expr
  ;

window_statement
  : WINDOW ( SCREEN? '(' x1=expr COMMA y1=expr ')' '-' '(' x2=expr COMMA y2=expr')' )?
  ;

write_statement
// Can omit argument to write an empty line
  : WRITE
// The QBasic help file says '#' is optional, but it's totally not.  WRITE 1, 1
// prints two ones to standard output, while WRITE #1, 1 prints a 1 to file
// number 1.  WRITE #1, prints a blank line to file number 1, while WRITE 1, is
// a syntax error.
  | WRITE file_number COMMA
// The IDE rewrites ';' as ',' for WRITE, so accept either.
  | WRITE (file_number COMMA)? expr ((COMMA | ';') expr)*
  ;

expr
  : '(' expr ')'           # ParenExpr
// Unusually, ^ is left-associative.
  | expr '^' expr          # ExponentExpr
// *** QBasic doesn't have unary plus, but the IDE accepts it and drops it.
  | '+' expr               # UnaryPlusExpr
  | '-' expr               # UnaryMinusExpr
  | expr ('*' | '/') expr  # MultiplyDivideExpr
  | expr '\\' expr         # IntegerDivideExpr
  | expr MOD expr          # ModExpr
  | expr ('+' | '-') expr  # PlusMinusExpr
  | expr ('=' | '>' | '<' | '<>' | '<=' | '>=') expr # ComparisonExpr
  | NOT expr               # NotExpr
  | expr AND expr          # AndExpr
  | expr OR expr           # OrExpr
  | expr XOR expr          # XorExpr
  | expr EQV expr          # EqvExpr
  | expr IMP expr          # ImpExpr
  | builtin_function       # BuiltinExpr
  | literal                # ValueExpr
// *** A variable with an array index is syntactically the same as a function
// call, so semantic analysis needs to distinguish those cases later.
  | variable_or_function_call # VarCallExpr
  ;

// These functions use keywords or special syntax like file numbers so can't
// just be pre-defined by the runtime.
builtin_function
  : INPUT_STRING '(' n=expr (COMMA '#'? filenumber=expr)? ')'
  | IOCTL_STRING '(' '#'? filenumber=expr ')'
  | LEN '(' expr ')'
  | PEN '(' expr ')'
  | PLAY '(' expr ')'
  | SCREEN '(' row=expr COMMA column=expr (COMMA colorflag=expr)? ')'
  | SEEK '(' expr ')'
  | STRIG '(' expr ')'
  | TIMER
  | mid_function
  | lbound_function
  | ubound_function
  ;

mid_function
  : MID_STRING '(' string=expr COMMA start=expr (COMMA length=expr)? ')'
  ;

// lbound and ubound take array arguments but do not append () to these like
// function calls, so it's simpler to special case these.
lbound_function
  : LBOUND '(' array=ID (COMMA which=expr)? ')'
  ;

ubound_function
  : UBOUND '(' array=ID (COMMA which=expr)? ')'
  ;

// Identifiers can contain '.', and '.' is also how to look up type elements.
// *** This grammar always matches the longest possible token name as an
// identifier, and expects later passes to decide whether 'x.y.z' is a variable
// or an element 'z' in a variable 'x.y'. However, we need to explicitly model
// one level of element lookup to parse 'array(x).y' - since user-defined types
// cannot contain arrays, only one '.' must be matched.
// 
// Note the IDE reformats "x   . y" as "x.y".
variable_or_function_call
  : name=(ID | FNID) ('(' argument_list ')' ('.' element=ID)?)?
  ;

// An argument list or set of array indices following an identifier,
// either an array lookup or a function call.
// May be empty for function calls with no arguments.
argument_list
  : argument (COMMA argument)*
  ;

argument
// Special syntax for passing an array argument.
  : array=ID '(' ')'
  | expr
  ;

// A system or user-defined type following an AS keyword.
type_name
  : INTEGER
  | LONG
  | SINGLE
  | DOUBLE
  | STRING
  | fixed_string
  | untyped_id
  | untyped_fnid
  ;

// Can _only_ use variable-length strings in sub parameter lists.
type_name_for_parameter
  : INTEGER
  | LONG
  | SINGLE
  | DOUBLE
  | STRING
  | untyped_id
  | untyped_fnid
  ;

// Can _only_ use variable-length strings in sub parameter lists.
type_name_for_declare_parameter
  : INTEGER
  | LONG
  | SINGLE
  | DOUBLE
  | STRING
  | ANY
  | untyped_id
  | untyped_fnid
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
type_name_for_type_element
  : INTEGER
  | LONG
  | SINGLE
  | DOUBLE
  | fixed_string
  | untyped_id
  | untyped_fnid
  ;

// A file number can be any expression that evaluates to a valid file handle
file_number : '#' expr ;

// QBasic supports fixed strings of 1-32767 bytes.
// - The IDE rewrites hex and octal lengths as decimals, so admit those.
// *** Check that they are integers later.
// - Floating point or string literals error with 'Overflow', so don't admit
// those.
//
// The language allows a constant after '*'.  The IDE will remove any type
// sigils after the constant, so allow but silently ignore a sigil.
// *** If ID is not a positive integral constant, the parser errors with
// 'Invalid constant' inside DIM statements.
// *** TYPE statements don't check the value of the integer constant, but
// you probably can't run the program if the value is bogus.
//
// Constants in TYPE elements have a few bugs.  QBasic can't handle IDs with a
// period inside TYPE, and errors with 'Statement illegal in TYPE block' if you
// try to use a constant with a period for a fixed string length.  IDs that are
// not constants parse ok, but trying to DIM things of the resulting TYPE hangs
// at runtime, and other weird behavior happens if you use a constant <= 0.
fixed_string
  : STRING '*' (len=(DIGITS | HEX | OCTAL) '%'? | ID)
  ;

// *** untyped_id and untyped_fnid should be checked for no trailing type sigil.
untyped_id: ID ;
untyped_fnid: FNID ;

literal
// If a floating point constant isn't explicitly marked as single or double,
// it's stored as single if it has 7 or fewer digits, else double.
// If you type 0000000.1, the IDE turns it into .1#, but 000000.1 stays single
// precision, so this is a lexical check.
// The IDE tries really hard to prevent explicit ! literals from existing...
// If you type 1.2345678!, the IDE automatically writes it as 1.234568.
  : PROBABLY_SINGLE_PRECISION_NUMBER
  | DOUBLE_PRECISION_NUMBER
// The IDE has all kinds of behavior for integer constants.
// - Erases trailing %
// - Rejects out of range values as 'Illegal number'.
// - Strips whitespace between '-' and a number.
// - Strips unary '+' from expressions in general, not just numbers, so no
//   need to handle that here.
// - Strips leading zeros, so accept those.
// If you type "2147483648" with no sigil the IDE turns it into 2147483648#
// "PRINT -32768%" gives an 'Illegal number' error, so the minus isn't parsed as
// part of the literal.
  | (DIGITS | HEX | OCTAL) ('%' | '&')?
  | STRING_LITERAL
  ;
