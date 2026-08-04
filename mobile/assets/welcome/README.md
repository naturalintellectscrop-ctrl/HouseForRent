# Welcome-screen collage tiles

These nine images are **stock architectural renders from the Stitch design
reference pack**, downloaded from its `lh3.googleusercontent.com` URLs and
committed here so the screen cannot break when those URLs expire.

They are **not properties on this platform.** Several are visibly not
Ugandan and not mid-market — an A-frame in a pine forest, a glass office
tower, an infinity-pool villa. They sit on the welcome screen as a mood
board, above copy that makes no claim about any specific home.

Everywhere else in the app, a property image slot renders an honest empty
frame until a field officer's capture exists (`PropertyImage` in
`components/ui.tsx`), because the platform's proposition is that the picture
was taken by our officer in that room.

## Replace these

When `MediaStorageProvider` is swapped off the V1 mock and real officer
photography exists, these should be replaced with nine captures of actual
verified listings in the Ntinda–Kira corridor. That is a straight file swap
— the filenames are referenced statically in `app/(auth)/welcome.tsx`.
