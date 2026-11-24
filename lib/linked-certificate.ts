/** Keep the certificate identity together when reconciling repeated Shopify syncs. */
export function linkedCertificate(
  session: { certificate_code?: string | null; certificate_metaobject_id?: string | null },
  orderCode?: string,
  incoming?: { code: string; id: string } | null,
) {
  const code = session.certificate_code || orderCode || incoming?.code || "";
  return {
    code,
    // Never attach an incoming object's ID to a different, already linked code.
    id: session.certificate_code === code && session.certificate_metaobject_id
      ? session.certificate_metaobject_id : incoming?.code === code ? incoming.id : "",
  };
}
