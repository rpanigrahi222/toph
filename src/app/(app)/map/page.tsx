import { PageHeader } from "@/components/page-header";
import { FarmMap } from "@/components/map/farm-map";
import { listFieldsWithRei } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function MapPage() {
  const fields = await listFieldsWithRei();
  return (
    <>
      <PageHeader
        title="Map"
        subtitle="Every field, with the restricted-entry interval from its last chemical application."
        search={false}
      />
      <FarmMap
        fields={fields.map((f) => ({
          id: f.id,
          code: f.code,
          name: f.name,
          acres: f.acres ? Number(f.acres) : null,
          geometry: f.geometry,
          centroidLat: f.centroidLat,
          centroidLng: f.centroidLng,
          lastSpray: f.lastSpray
            ? {
                productName: f.lastSpray.productName,
                appliedAt: f.lastSpray.appliedAt?.toISOString() ?? null,
                reiHours: f.lastSpray.reiHours,
                workerName: f.lastSpray.workerName,
              }
            : null,
          reiExpires: f.reiExpires?.toISOString() ?? null,
        }))}
      />
    </>
  );
}
