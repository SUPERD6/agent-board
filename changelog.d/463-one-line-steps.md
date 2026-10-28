- **A card on the serve page shows each step as one line (#463).** A step, or a step with its
  note, that does not fit on one line shows as one clipped line with an ellipsis; opening it, by
  click or by keyboard, shows the whole step, and it stays open when the page draws again. A Done
  button names a long step by its first words and keeps the whole step in its title, and a press
  still ticks the whole step. Done recently rows use the task title, clipped, never a step text.
  Nothing is cut from the record: the clipping counts characters, so it never splits a Chinese
  character or a surrogate pair, and a line break inside a step folds into one space. Stopped
  cards clip the same way.
  Tests: `a step longer than one line shows one line on the card and its full text on open`,
  `a Done button names a long step by its first words`,
  `Done recently rows show the task title, not a step text`,
  `a clipped step keeps its open state across a refresh`,
  `clipping a Chinese step never splits a character`,
  `the board model clips a step to one line and keeps the whole step for a press`.
- **One question asked in several places is one card (#463).** Questions with the same agent, the
  same project folder (C:\a\b and C:/a/b are one folder) and the same words once trimmed and with
  spaces collapsed show as one card, with the oldest age and the newest source; the other copies
  stay in the question list. Hide, Mark read and an answer close every copy asked before the one
  closed, in another session, and a copy asked after shows again. The count beside Waiting on you
  counts the question once. Another agent, or another folder, is another question; two copies
  from one session, and a copy the question list has no record of yet, stay as they were.
  Tests: `the same question in a block and in an inbox capture shows as one card`,
  `the same question in two blocks of one agent and folder shows as one card with the oldest age`,
  `the same words from two different agents show as two cards`,
  `hiding or answering the one card closes every copy of it`,
  `the count beside Waiting on you counts the question once`,
  `a stopped session's copy joins the live card instead of listing the question again`,
  `two retained copies of one question show once under Older`,
  `a copy cut off in the middle of a write neither makes a card vanish nor changes its age`.
- **The HTML board shows a question that is in an agent block and in the inbox once (#463).** The
  test that pinned the old duplicate now pins one card and a count of one.
  Tests: `the HTML board shows a question that is in both an agent block and the inbox once, like the terminal board and --serve`.
