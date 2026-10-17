# Flexible certificate prototype

Installed only on the unpublished **Meaningful id update** theme (160380125255).

- `sections/certificate-note-fluid.liquid` adds natural text flow, responsive font sizes, preserved line breaks, and long-word wrapping.
- `sections/certificate-details-fluid.liquid` keeps the existing centred, 18px bold ID details while allowing each field to wrap naturally. The panel expands and moves the meaningful note down.
- `templates/metaobject/version_1_certs.json` replaces the previous fixed-height ID-details and meaningful-note sections. Other certificate sections are preserved.
- The original `4_Bottom.png` artwork provides the decorative divider. A single CSS panel draws the expanding body and rounded bottom, so raster edges cannot create seams between those areas. The original image file is unchanged.
- No JavaScript or backend changes are needed. Customer notes and certificate fields are unchanged.

In the theme editor, open a certificate and select **Meaningful note (fluid)**. Use **Preview note (editor only)** to test another note length without changing a customer's saved note. Clear it to use the real note. This field never overrides customer notes outside the theme editor.

Select **ID details (fluid)** to test long Favourite Person, Belongs To, and Birthplace values using its editor-only preview fields. Clear the preview fields to display the real certificate details. No customer data is changed. Normal, long, and unbroken ID values passed phone and desktop checks with no horizontal overflow or overlapping rows; the meaningful note stays below the details.

Validation: Shopify Liquid checks passed for both changed files. The real certificate was previewed in the draft theme. Layout cases covering short, medium, very long, multiline, quoted/emoji and unbroken text passed at 390px and desktop widths, with no text clipping, horizontal overflow, or overlap with the bottom decoration.
