# Flexible meaningful-note prototype

Installed only on the unpublished **Meaningful id update** theme (160380125255).

- `sections/certificate-note-fluid.liquid` adds natural text flow, responsive font sizes, preserved line breaks, and long-word wrapping.
- `templates/metaobject/version_1_certs.json` replaces only the previous fixed-height meaningful-note section. Other certificate sections are preserved.
- The original `4_Bottom.png` artwork provides the divider and rounded bottom. CSS displays those decorative regions around an expanding panel; the image file is unchanged.
- No JavaScript or backend changes are needed. Customer notes and certificate fields are unchanged.

In the theme editor, open a certificate and select **Meaningful note (fluid)**. Use **Preview note (editor only)** to test another note length without changing a customer's saved note. Clear it to use the real note. This field never overrides customer notes outside the theme editor.

Validation: Shopify Liquid checks passed for both changed files. The real certificate was previewed in the draft theme. Layout cases covering short, medium, very long, multiline, quoted/emoji and unbroken text passed at 390px and desktop widths, with no text clipping, horizontal overflow, or overlap with the bottom decoration.
