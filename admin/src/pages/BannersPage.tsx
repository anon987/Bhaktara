import { BannerManager } from "../banners/BannerManager";

// Doc 09 §7 banner manager (internal targets only, D-015), in the v2 look.
export function BannersPage() {
  return (
    <div className="legacy">
      <BannerManager />
    </div>
  );
}
