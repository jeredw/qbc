    ON TIMER(1) GOSUB TimeUpdate
    TIMER ON
    CLS
    PRINT "Time: "; TIME$
    StartTime = TIMER
    WHILE TimePast < 10
        TimePast = TIMER - StartTime
    WEND
    END

    TimeUpdate:
        LOCATE 1, 7: PRINT TIME$
        RETURN
