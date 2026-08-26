window.MANUAL_CONTENT = window.MANUAL_CONTENT || {};
window.MANUAL_CONTENT.en = (() => {
  const rows = list => list.map(([a,b]) => `<tr><th>${a}</th><td>${b}</td></tr>`).join('');

  const start = `
    <h2 id="m-start">1. Getting Started</h2>
    <p>When you open the app, choose one of three roles.</p>
    <table class="doc-t">
      <tr><th>Owner</th><td>The owner of this club. Uses a <b>different password from the admin</b>.
        Can do everything an admin can do, plus <b>operations that replace the entire member list</b>.</td></tr>
      <tr><th>Admin</th><td>Runs the match rotation. Requires the admin password; up to 2 admins can be signed in at the same time.</td></tr>
      <tr><th>Member</th><td>A registered member. Manages your own check-in and turn.</td></tr>
      <tr><th>Guest</th><td>A first-time visitor. You can request to register as a member, or just watch.
        If you choose to just watch, you see only the <b>match board and this manual</b> — the member list, check-in, records, and settings are hidden.
        Names on the match board also show only the <b>surname</b> (<span class="doc-k">김철수 → 김○○</span>).</td></tr>
    </table>
    <h3>Member registration goes through admin approval</h3>
    <p>Entering your name as a guest does not make you a member right away. There are two ways to register.</p>
    <table class="doc-t">
      ${rows([
        ['<b>Send an approval request</b>',
         'The default path. It goes through even when the admin is not around. After you send the request, just watch the match board — the moment ' +
         'the admin approves it, <b>your screen switches to member view on its own</b>. No need to close and reopen the app.'],
        ['<b>Register on the spot with the admin</b>',
         'Use this when the admin is right there. Entering the admin password registers you as a member on the spot. Since this means typing the ' +
         'password on someone else\'s device, cover the screen while you type it, or use the approval-request path instead.']
      ])}
    </table>
    <p>Once you choose a role, this device remembers it and takes you straight in next time.
       To change it, tap <b>Settings → Re-enter</b>.
       Guests have no settings screen, so tap the <b>Enter</b> button at the top of the screen instead.</p>

    <h3>If you want to open a new club</h3>
    <p>At the main address (<span class="doc-k">happybirdies.web.app</span>), there is an
       <b>Apply for a New Club</b> button below the club code field. Anyone can use it without signing in.</p>
    <ol>
      <li>Enter the country, region, club name, club code (in English letters), owner name, contact info, and owner email, then submit.
        The club opens immediately upon submission — you are not blocked while waiting for approval; it only leaves a
        (<span class="doc-k">Pending approval</span>) marker for staff to review later.</li>
      <li>Next, verify with <b>the Google account matching the email in your application</b>. Only after this verification does that
        account become the real owner — to prevent anyone from writing down an arbitrary email and claiming someone else's club,
        the email Google confirms must exactly match the email on the application.</li>
      <li>Once owner verification is complete, you set the <b>admin password</b> right there. As soon as it is set, you can sign in
        as admin and start a trial run, moving people through the courts.</li>
    </ol>
    <div class="doc-note">
      Google verification can wait — since the club opens as soon as you apply, before verifying you can go to the club's address
      and look around once the admin gives you the password. However, only the owner can <b>set the admin password for the first
      time</b>, so until then no one can sign in as admin.
    </div>

    <h3>Display language</h3>
    <p>Korean, English, Chinese, and Japanese are supported. The admin or owner sets it in the <b>Settings</b>
       tab so every device at this club shows the same language (members and guests can't change it) —
       see the admin section below for details. New clubs default to <b>English</b>.</p>`;

  const member = `
    <h2 id="m-member">2. For Members</h2>

    <h3>Signing in</h3>
    <ol>
      <li>Tap <b>Member</b>.</li>
      <li>Find your name in the list. The last character is masked — <span class="doc-k">김철수 → 김철○</span></li>
      <li>Enter the <b>one masked character</b>.</li>
      <li>You are asked whether to check in. Tap <b>Yes</b> to join the Waiting Pool and receive assignments.</li>
    </ol>
    <div class="doc-note">
      <b>After 3 wrong tries</b>, this device is locked for <b>3 minutes</b>. If it is urgent, ask the admin.<br>
      Names that look the same once masked (김철수 · 김철민 → both show as <span class="doc-k">김철○</span>) are grouped into one line.
      The character you type is what tells them apart.
    </div>

    <h3>Checking in and leaving</h3>
    <ul>
      <li>Use the <b>your-name button</b> at the top of the screen to check in or cancel your check-in.</li>
      <li>You cannot cancel while playing a match. Do it after the match ends.</li>
      <li><b>If you are leaving early, be sure to cancel your check-in.</b> Otherwise you stay eligible for
          assignment, and other people's turns get pushed back.</li>
    </ul>

    <h3>Checking your turn</h3>
    <p>When you are assigned to a court, a <b>large notice</b> appears in the middle of the screen. It shows
       which court number and who you are playing with.</p>

    <h3>Reading the screen</h3>
    <table class="doc-t">
      ${rows([
        ['Name color', 'Color indicates gender. <b class="doc-m">Blue = male</b>, <b class="doc-f">Magenta = female</b>. ' +
                    'If it is <b class="doc-u">orange</b>, gender was not entered — please tell the admin.'],
        ['Top right of the name, <span class="doc-k">3G</span>', 'Number of games played today.'],
        ['Bottom right, <span class="doc-k">12 min</span>', 'Time elapsed since the last match ended.'],
        ['Queue', 'Teams waiting for their turn. The higher up, the sooner they go out.'],
        ['Waiting Pool', 'People who have not yet been placed on a team.']
      ])}
    </table>

    <h3>What you can do</h3>
    <ul>
      <li>You can move <b>only your own name</b>. Your chip has a green border.</li>
      <li>Only between the Waiting Pool and the Queue. <b>Only the admin assigns courts</b>.</li>
      <li>You cannot move anyone else's name. If you want to swap turns with someone, ask the admin.</li>
      <li>The <b>Records</b> tab shows how many games you have played today and your match history.</li>
    </ul>`;

  const admin = `
    <h2 id="m-admin">3. For Admins</h2>

    <h3>Screen layout</h3>
    <table class="doc-t">
      ${rows([
        ['Top',            '<b>Courts</b> — matches being played right now'],
        ['Bottom left',    '<b>Queue</b> — teams going out next (from the top down)'],
        ['Bottom right',   '<b>Waiting Pool</b> — people not yet placed on a team']
      ])}
    </table>
    <p class="doc-flow">Waiting Pool <span>→</span> Queue <span>→</span> Court <span>→</span> Waiting Pool</p>
    <p>People move through this cycle. Every action below follows this same loop.</p>

    <h3>Power Gauge &amp; Elapsed-Time Bar</h3>
    <ul>
      <li>The <b>single horizontal bar</b> above each court and waiting slot shows two things at once.
          Its <b>length</b> is the ratio of the two teams' <b>Power</b> (a relative value combining skill grade
          × age × gender). Team A is on the left, Team B on the right, with a divider between them — at 50:50
          the divider sits exactly in the middle. The faint tick mark in the center marks the "exactly half"
          line, so you can tell which side is stronger at a glance from how far the divider has shifted from it.</li>
      <li>In the Queue and Waiting Pool, a <b>vertical bar</b> next to each name shows that person's individual
          Power. The height is relative to the strongest person currently on screen.</li>
      <li>Power is a rough visual reference, not a precise skill measurement. It is not used in placement
          calculations (auto-fill) — those look only at skill grade, games played, and wait time.</li>
      <li>The bar's <b>color</b> shows <b>elapsed match time</b>. As it approaches the <b>Match Time Warning</b>
          (in Settings, default 18 min), it shifts from green to orange to red, and once it hits the limit the
          court's border also turns red — so you can spot which court has run long from across the room.
          Waiting slots are not a match yet, so they are always green (just read the length there).</li>
    </ul>

    <h3>There Are No Buttons</h3>
    <p>There are no start, end, or remove buttons on the courts. You only need to remember two gestures.</p>

    <h4>Double-tap = move to the next stage</h4>
    <table class="doc-t">
      <tr class="doc-hd"><th>Where you tap</th><th>Tapping one name</th><th>Tapping the team box</th></tr>
      <tr><td>Waiting Pool</td><td>To an empty Queue slot</td><td>—</td></tr>
      <tr><td>Queue</td><td>To an empty court slot</td><td>Whole team to the court</td></tr>
      <tr><td>Court</td><td>To the Waiting Pool</td><td>Whole team to the Waiting Pool</td></tr>
    </table>
    <div class="doc-note"><b>Tapping an empty court or an empty waiting slot fills it.</b> This is meant for
      running things by hand with the 'Auto' toggle or 'auto-fill courts' turned off — it always works
      regardless of that setting.
      <ul style="margin:6px 0 0;padding-left:18px">
        <li><b>Empty court</b>: If a fully filled team is waiting in the Queue, that team moves straight up.
            If not, a prompt asks <b>"build a team automatically, just this once?"</b> — confirming builds
            one from the Waiting Pool and places it.</li>
        <li><b>Empty waiting slot</b>: Fills immediately from the Waiting Pool without asking. Filling the
            Queue is not the same as starting a match, so it is easy to undo.</li>
      </ul></div>

    <h4>Drag = anywhere</h4>
    <p>Grab a name or a team box and drag it anywhere — to a court, the Queue, or the Waiting Pool. This works
       even for a team with fewer than 4 people, or a court that is already playing.</p>
    <p>With a finger, <b>dragging and scrolling are the same motion</b>, so the app has to tell them apart.
       It does this by <b>how you move</b>, not by making you wait.</p>
    <table class="doc-t">
      ${rows([
        ['<b>Move sideways</b> → drag',
         'Everything that scrolls in this app scrolls up and down. A finger moving sideways cannot be a ' +
         'scroll, so <b>it is picked up the instant it moves.</b> No need to wait.'],
        ['<b>Push up or down right after touching</b> → scroll',
         'Pushing vertically almost the instant you touch down is a scrolling motion. The screen scrolls as usual.'],
        ['<b>Pause to aim, then move</b> → drag',
         'If you pause briefly to aim at the name you want, then move, it counts as a drag from that point ' +
         'on — even moving vertically is fine.'],
        ['<b>Just hold it down</b> → drag',
         'Holding still for about 0.2 seconds also picks it up. The moment it is picked up, the device gives ' +
         'a <b>short vibration</b> — since your finger covers the screen, your hand knows before your eyes do.']
      ])}
    </table>
    <div class="doc-note">If you lift your finger <b>without moving at all</b> after it is picked up, nothing
       moves. That counts as a tap, not a drop.</div>

    <h4>Dropping on a person swaps places</h4>
    <p>Dropping on <b>another person</b> instead of an empty slot swaps the two. This works <b>even on a court
       that is mid-match, and even within the same court</b> — reshuffling the four people on a court into
       different teams is done this way too. The match clock keeps running, and the team makeup in the record
       follows the change.</p>

    <h4>Swapping two courts entirely</h4>
    <p>Grab a court card and drop it on <b>another court</b> to swap the two teams' courts. This works even
       if both are mid-match — each match keeps going, and <b>the time and the record follow the people.</b>
       If the other court is empty, it is not a swap but a plain move, and <b>the match still keeps going</b>
       either way — you moved the court, you did not undo the game.</p>
    <div class="doc-note">There is no situational restriction on what an admin can move by hand. You can
       rotate the four people within a court, or swap someone mid-match with someone in the Waiting Pool.
       Anyone who comes off a mid-match court and goes <b>outside the courts</b> gets credit for a game if
       they played at least 1 minute. Swapping courts with each other does not count, since it is just a
       change of location.</div>

    <h3>Starting and ending</h3>
    <ul>
      <li><b>A match starts automatically the instant a court fills to 4</b>, whether people got there by
          hand, by auto-fill, or by drag.</li>
      <li><b>Sending a whole team to the Waiting Pool ends the match.</b> All four people's game count goes
          up by 1 and it is saved to the record.</li>
      <li><b>Moving a team to another court keeps the match going.</b> Time and record follow the people —
          you moved the court, you did not end the game. If the other court has people, the two teams swap places.</li>
      <li><b>Moving a team to the Queue asks you a question</b> — see below.</li>
      <li><b>Reaching the max match time (default 30 min) ends it automatically.</b> See below.</li>
    </ul>
    <div class="doc-note big">In one line — <b>moving to the next stage ends the match; moving to another
      court keeps it going.</b></div>

    <h3>After 30 minutes, it ends on its own</h3>
    <p>When a match reaches the <b>max match time</b>, that court ends without waiting for the admin. All
       four people's game count goes up by 1, it is saved to the record, and they drop to the Waiting Pool —
       exactly as if the admin had sent them there.</p>
    <ul>
      <li><b>Win/Loss is left blank.</b> Just because 30 minutes passed does not tell you who won, and
          filling in a value anyway would not be a record — it would be a fabrication.
          You can enter it later in the result column of <b>Records tab → Match History</b>.</li>
      <li>The default is <b>30 minutes</b>. Change it in Settings → <b>Max Match Time</b>, or set it to
          <span class="doc-k">0</span> to turn it off.</li>
      <li>While the match board is not being watched (another tab open, screen off), time cannot be tracked.
          If the limit has already passed by the time you come back, it ends right then.</li>
    </ul>

    <h3>Match time is the same on every device</h3>
    <p>No single tablet is the one counting the match time. The <b>start time</b> is written to the cloud,
       and each device simply subtracts it from the current time. So the time keeps going even if you turn
       a tablet off and back on, or switch to viewing it on a different device partway through.</p>
    <p>The only variable is that each device's clock runs slightly differently, so the app auto-corrects
       against the <b>server clock</b>. The reason no single device is used as the reference is simple —
       if that device gets turned off or leaves the room, the reference itself disappears.</p>
    <div class="doc-note">You can check how far off this device's clock is under Settings → Storage →
      <b>Difference from Server Clock</b>. If it is off by several minutes, check the device's date and
      time settings. The app corrects for it automatically, but other apps' clocks will keep being wrong.</div>

    <h3>A just-assigned court blinks for 10 seconds</h3>
    <p>When a match starts, that court card's border blinks for <b>10 seconds</b>. It is a signal so that
       when your name is called, you do not have to hunt the screen for "which court am I on?" It stops
       after 10 seconds — if it kept flashing, it would stop being a signal and become noise, burying the
       <b>timeout (red border)</b> that you actually need to watch for.</p>

    <h3>Moving a mid-match team to the Queue — rematch or cancel?</h3>
    <p>Dragging a mid-match court <b>to a waiting slot</b> asks you which of two things you mean.
       The same gesture can mean two opposite things.</p>
    <table class="doc-t">
      ${rows([
        ['<b>Rematch</b>',
         'You finished a game and this same team is waiting for its next turn. <b>It counts as a completed ' +
         'match</b> — all four people\'s game count goes up by 1 and it is saved to the record. You are then ' +
         'asked for the result (Win/Loss, score), after which the same team goes up in the slot you dropped ' +
         'it on, marked with a <b>Rematch</b> label.'],
        ['<b>Cancel Match</b>',
         'Use this when the team was placed by mistake, or the court needs to be cleared urgently. <b>It ' +
         'undoes the match entirely</b> — no game count or record is left.'],
        ['<b>Dismiss</b>', 'The match just keeps going.']
      ])}
    </table>
    <div class="doc-note">In the past, this was not asked — it was <b>always treated as Cancel</b>.
      So every rematch wiped out all four people's game counts and that match's record entirely.
      <b>A rematch team is also not broken up by auto-reorder (the Reorder button).</b></div>

    <h3>Match Result (Win/Loss &amp; Score)</h3>
    <p>Whenever a match ends — <b>double-tap</b>, <b>dragging to the Waiting Pool</b>, and the
       <b>Rematch</b> above — a result prompt appears. Tapping the <b>Result</b> column in the Records
       tab later opens the same prompt. Team makeup, winner, and score are all set on one screen.</p>

    <h4>Confirm the team makeup</h4>
    <p>The pairing currently on record (Team A / Team B) shows as name chips — the same chips you see on
       the match board. Sometimes people swap positions on the court without moving anyone in the app —
       recording the result as-is would leave <b>the winners and losers swapped</b> in the record. So these
       chips <b>blink with a red border</b> as a reminder to double-check them. If the pairing is wrong,
       <b>drag a chip onto the other team</b> — it swaps places with whichever chip is there.</p>
    <div class="doc-note">The headcount is always <b>2 vs 2</b>. Adding or removing a person is something
      you do on the match board, not in the result prompt. The corrected makeup is applied when you save,
      and the match type (Men's Doubles, Mixed Doubles, etc.) is recalculated to match.</div>

    <h4>Pick the score · pick the winner</h4>
    <p>A <b>horizontal slider</b> sits to the right of each team's name — winner or loser, both teams use
       the same slider to pick any value from <b>10 to 30</b>. The current value shows large and bold right
       next to the slider (the slider's own handle shows no number — your finger would cover it anyway).
       To mark a team as the winner, <b>tap its name (the name/number side, not the chips)</b> — a trophy
       (🏆) appears next to it. Tap again to deselect.</p>
    <table class="doc-t">
      ${rows([
        ['<b>Why isn\'t this calculated automatically?</b>',
         'Earlier versions only asked for the losing score and calculated the winning score from a rule — ' +
         'but when the losing score was 20 or under, <b>the score alone couldn\'t tell whether it was a ' +
         '21-point or 25-point game</b>, so you had to be asked anyway. Now both sliders are picked ' +
         'directly — this records the actual score from that day rather than computing one.'],
        ['<b>Unknown</b>',
         'Ends the match without recording a score or a winner. Game count and match time are still ' +
         "recorded normally. Use this when you don't know the result — it's better than entering a made-up value."],
        ['<b>Picked the wrong thing?</b>',
         "If you haven't saved yet, just pick again — nothing is final until Save. If it already saved, " +
         'use the <b>↩ Undo</b> button at the top, or reopen it from the Records tab to fix it.']
      ])}
    </table>

    <div class="doc-note">It is fine to fill this in later. Tapping the
      <b>Result</b> column in <b>Records tab → Match History</b> opens the same prompt so you can enter
      or correct the Win/Loss and score — if a result is already on record, the screen starts from those
      values. The per-person table shows <b>Wins-Losses</b> together
      (only matches with a recorded result are counted).</div>

    <h3>Require Match Result (can be turned off in Settings)</h3>
    <p>Recording results is a chore, so just popping up a prompt does not get it filled in reliably. So
       there is a way to <b>block instead of ask</b>. While Settings → <b>Require Match Result</b> is on:</p>
    <ul>
      <li>The <b>result prompt no longer appears</b> when a match ends. It just ends.</li>
      <li>Instead, those four people's chips <b style="color:var(--cork)">blink red and cannot be moved
          anywhere.</b> They are excluded from auto-assign too, and even if placed in the Queue they will
          not move up to a court.</li>
      <li>To put them into the next match, you must <b>enter the result first</b>. Trying to move a locked
          chip opens the result prompt right there — what you were trying to do becomes the same motion as
          what you need to do.</li>
      <li>You can also open it from the <b>N Matches Awaiting Result</b> button above the Waiting Pool.</li>
    </ul>
    <div class="doc-note">For a match where truly no one remembers the score, use
      <b>Unknown — Release Without Recording</b> in the result prompt. Without any escape hatch, those four
      people would stay locked forever. But since it is a deliberate tap, it does not get forgotten by accident.<br>
      <b>New clubs have this on by default.</b> (Clubs that already existed keep whatever they had chosen.)
      Turning it on does not lock matches that had already ended — it means results are required from that
      point forward, not a retroactive interrogation of past matches.</div>

    <h3>Records are kept permanently by date</h3>
    <p>A finished match is logged to a permanent ledger by date, <b>separate from that day's match board</b>.
       It is not erased when everyone leaves, a session ends, or the date rolls over.
       You can view it under <b>Cumulative Stats</b> in the Records tab, filtered by <b>Last 4 sessions · Last 12 sessions · All time</b>.</p>
    <table class="doc-t">
      ${rows([
        ['<b>Per person</b>', 'Games played, wins, losses, win rate, average point differential, and days attended.'],
        ['<b>Frequent partners</b>', 'Who was on the same team with whom, and how often. This is where you can see if pairings have grown lopsided.'],
        ['<b>Frequent opponents</b>', 'Who played against whom, and how often.'],
        ['<b>Members and guests</b>',
         'Members are linked <b>by member number</b> — changing a name, or two people sharing a name, will ' +
         'not mix them up. Guests have no number to attach, so they are grouped <b>by name only</b>, meaning ' +
         'two different guests with the same name can appear as one person. This is marked separately in the table.']
      ])}
    </table>
    <div class="doc-note">Wins, losses, and win rate count <b>only matches with a recorded result</b>.
      Games played counts everything regardless of result, so wins + losses can be less than games played.</div>

    <h3>Considering past history in matchmaking</h3>
    <p>Duplicate avoidance originally only looked <b>within today</b>. So it did nothing to stop the same
       people from meeting week after week — if a pairing was new today, it got a penalty of 0 even if they
       had played together every week for the past four months.</p>
    <p>Entering a number of days in Settings → <b>Consider Past History</b> pulls in that many past session
       days and adds <b>how often two people were on the same team</b> into the duplicate-avoidance score.</p>
    <ul>
      <li>The unit counted is <b>days played</b>. <span class="doc-k">8</span> means the most recent 8 days
          that have records, not 8 calendar days.</li>
      <li>Past history counts at <b>half the weight of today's</b>. Playing against someone you just played
          matters more than playing them last week. Weighting them equally would let accumulated old history
          overwhelm today's fairness (the games-played gap).</li>
      <li><b>At 0, it works exactly as before</b> — only looking within today. The default is 0.</li>
    </ul>

    <h3>When only one person comes off</h3>
    <p>When <b>only one person</b> is moved off a mid-match court to the Queue or Waiting Pool (leaving
       partway through, or swapping someone out), it is handled like this.</p>
    <ul>
      <li>The person who comes off gets <b>+1 game count if they played at least 1 minute.</b> Placing
          someone by mistake and immediately taking them back off is common, and counting that as a match
          too would throw the game counts off.</li>
      <li><b>The match keeps going for the people left on the court.</b> The clock keeps running too.
          Putting someone else into the empty spot continues the same match, and when the team is later
          sent to the Waiting Pool, everyone who stayed gets their own game count.</li>
      <li>Moving to another <b>court</b> is a change of location, not an ending, so it does not count.</li>
    </ul>

    <h3>The three buttons at the top</h3>
    <table class="doc-t">
      ${rows([
        ['<b>Auto</b>',
         'When on, it fills empty slots automatically. Turning it off does not stop <b>the ordering</b> — ' +
         'if Q1 empties out, Q2 always shifts forward even with Auto off.'],
        ['<b>Reorder</b>',
         'Breaks up and rebuilds only the auto-built waiting teams. Teams you built by hand, or slots with a set match type, are left untouched.'],
        ['<b>↩</b>',
         'Undo. Goes back up to the last 20 steps. Deleting from the member list cannot be undone.']
      ])}
    </table>

    <h3>Ordering rules</h3>
    <ul>
      <li>Empty slots are <b>always filled from the front</b> — the Queue goes Q1 → Q2 → …, courts go Court 1 → Court 2 → …</li>
      <li>When a front slot empties, the ones behind it shift forward. The Queue never has a gap left in the middle.</li>
      <li><b>First-in-first-out applies only to slot order.</b> It decides which slot or court fills first —
          not who goes out first.</li>
      <li>Who gets placed is decided by <b>fewest games played and longest wait</b> — not by who arrived
          first. Recent pairings are avoided, and skill-grade gaps are weighed too. If you arrived early but
          have already played a lot, you get pushed back. That is what fair assignment means here.</li>
    </ul>

    <h3>Approving join requests</h3>
    <p>A guest's join request goes into a <b>pending list</b>, not the member list.
       When there are requests, a <span class="doc-k">N Join Requests</span> button appears on the <b>Member</b> tab.
       Tap it to approve or reject.</p>
    <ul>
      <li><b>Approving</b> adds them to the member list, and the requester's device automatically switches to member view.</li>
      <li><b>Before approval</b>, that name does not appear anywhere — not on the sign-in screen or the check-in screen.</li>
      <li>If a member with the same name already exists, approving does not create a duplicate — it just clears the request.</li>
    </ul>

    <h3>Owner vs. Admin — different sign-in paths</h3>
    <ul>
      <li><b>The owner signs in with an account.</b> Email/password or a Google account.
          A shared-password method was removed — with just a password, the server has no way to confirm
          "this person is the owner," so a role divided that way was only meaningful within the app screen.</li>
      <li><b>The admin signs in with an ID and password.</b> The ID is already filled in as the club name
          (there is nothing to choose), so you just enter the password.</li>
      <li><b>The owner is the one who sets the admin password.</b>
          Set it under <b>Settings → Admin Password</b>, and it can be reset any time. The old password
          stops working the moment it is changed — no need to open a console when the admin changes.</li>
    </ul>

    <h3>The admin password</h3>
    <ul>
      <li>It is stored in the cloud <b>only in an irreversible form</b>. Neither the app nor the console can see the original value.</li>
      <li>Verification happens in the cloud, so <b>the first sign-in needs an internet connection</b>.
          Once you are in, this device remembers it, so you stay signed in as admin offline after that.</li>
      <li><b>If you forget it</b>, the owner can set a new one under <b>Settings → Admin Password</b>.
          If the owner account itself is lost too, <span class="doc-k">clubs/(club)/roles/(uid)</span>
          has to be re-seeded in the Firebase console.</li>
      <li><b>After 5 wrong tries, that device locks.</b> The lockout grows 1 min → 2 min → 4 min …, and
          getting it right once resets the count. A failed check due to being offline does not count as an
          attempt, so a bad connection will never lock you out.</li>
      <li>A 4-digit number is guessed quickly. Set something at least 8 characters long and write it down.
          The lockout above only guards against <b>someone manually trying passwords</b> — it is no substitute for a long password.</li>
    </ul>

    <h3>Managing members</h3>
    <ul>
      <li>Add, edit, and delete from the <b>Member</b> tab.</li>
      <li>For someone who has not shown up in a while, <b>Deactivate</b> is recommended over deleting. Their past record stays intact.</li>
      <li>The <b>CSV bulk import</b> format is <span class="doc-k">name,birthYear,grade,gender</span> (header row included).</li>
      <li>Take a <b>backup</b> now and then. Even with cloud storage, having a separate file on hand is safer.</li>
      <li>Gender is used to determine Men's Doubles, Women's Doubles, and Mixed Doubles, so it <b>must</b> be entered.</li>
    </ul>

    <h3 class="doc-warn-h">Protecting the Member List — Please Read</h3>
    <p>Operations that replace the member list <b>wholesale</b> — restoring a backup · CSV bulk import ·
       reloading from the cloud — are <b>owner-only</b> and require the <b>owner password</b> to proceed.
       This is because they are the most destructive operations in the app: irreversible, and propagated
       to every device instantly. (In a club that has not set an owner password yet, the admin password is
       used to verify instead, and the app tells you so.) The confirmation prompt first shows who is
       removed and who is newly added.</p>
    <div class="doc-note warn">
      A save that would remove members without going through a password is <b>blocked automatically</b>,
      and a <b>red banner</b> appears at the top of the screen.<br>
      <b>If you see the red banner, do not touch anything — just refresh.</b>
      Only the save is locked; the data in the cloud is untouched.
    </div>

    <h3>Closing Out</h3>
    <ul>
      <li><b>End Session</b>, under the <b>Records</b> tab, signs everyone out and clears the match board.
          That day's match records are not deleted.</li>
      <li>Even if you forget, it closes out on its own <b>12 hours after the first match started</b>.</li>
    </ul>

    <h3>Frequently used settings</h3>
    <table class="doc-t">
      ${rows([
        ['Display language',
         'Every device at this club shows the language you pick here — devices can\'t each show a different one. ' +
         'Choosing Korean, English, Chinese, or Japanese propagates to other tablets right away. New clubs default ' +
         'to <b>English</b>. (The standalone help page, manual.html, is separate and follows each device\'s own ' +
         'preference — change it with the button in that page\'s top right.)'],
        ['Number of courts / waiting slots',
         '<b>The match board is not reset.</b> Courts and slots are only added or removed at the end, so everything else stays as it was. ' +
         'You can open an extra court even mid-session. When reducing count would remove a slot with people in it, you are shown ' +
         'exactly what will happen and asked to confirm first — those people drop to the Waiting Pool, and if the removed slot was ' +
         'a court mid-match, it is <b>treated as a completed game</b> and the game count goes up (Win/Loss is left blank).'],
        ['Minimum pool reserve',   'Keeps this many people in the Waiting Pool instead of filling the Queue all the way. At 0, the same 4 people who just played together can get grouped right back into a team.'],
        ['Match time warning',     'Past this time, the court is shown in red.'],
        ['Gender policy',          'The default is <b>Ignore Gender</b>. Teams are built on fairness alone, and the resulting type is simply labeled afterward.'],
        ['Games-played gap',       'The larger this is, the more strongly "fewer games played goes first" is enforced.']
      ])}
    </table>`;

  const trouble = `
    <h2 id="m-trouble">4. When Something Is Not Working</h2>
    <table class="doc-t">
      ${rows([
        ['A <b>red banner</b> appeared at the top of the screen',
         'Saving is locked. Do not touch anything — just <b>refresh</b>. The data is untouched.'],
        ['The member list looks empty',
         '<b>Do not save anything</b> — first tap Settings → Data Recovery → <b>Reload Now</b>.'],
        ['I was told it was fixed, but the screen looks the same',
         'Check Settings → <b>App Version</b>. If the number has not changed, the browser is still using the old file — refresh (on phones, close and reopen the tab).'],
        ['The screen does not match another tablet',
         'Refresh both. Also check whether Settings → Storage shows <b>Firebase Connected</b>.'],
        ['Member sign-in is locked',
         'You entered the verification character wrong 3 times. It unlocks on its own after 3 minutes. If it is urgent, the admin can check you in instead.'],
        ['No sound',
         'Check Settings → Sound Effects. Browsers cannot play sound until the screen has been tapped once.']
      ])}
    </table>`;

  return {
    ui: {
      title: 'Badminton Match Board User Guide',
      lead: 'Members only need the first two sections; admins should read everything.',
      tocStart: '1. Getting Started',
      tocMember: '2. For Members',
      tocAdmin: '3. For Admins',
      tocTrouble: '4. When Something Is Not Working',
      youAreHere: 'My Current Role',
      footerNote: 'This guide is also available from the app\'s <b>Help</b> tab.',
      openApp: 'Open the board →'
    },
    start, member, admin, trouble
  };
})();
