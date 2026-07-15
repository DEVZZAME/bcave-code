export type PermissionCategory = "file_read" | "file_write" | "shell_exec";
export type PermissionMode = "safe" | "auto-approve" | "yolo";

export class PermissionManager {
  private mode: PermissionMode;
  private approved: Set<PermissionCategory> = new Set();

  constructor(mode: PermissionMode) {
    this.mode = mode;
    // Auto 모드: 읽기 전용(read/list/search)은 안전하므로 처음부터 자동 승인.
    // 쓰기·실행은 종류별로 처음 한 번만 확인.
    if (mode === "auto-approve") this.approved.add("file_read");
  }

  needsApproval(category: PermissionCategory): boolean {
    if (this.mode === "yolo") return false;
    if (this.mode === "auto-approve" && this.approved.has(category)) return false;
    return true;
  }

  approve(category: PermissionCategory): void {
    if (this.mode === "auto-approve") {
      this.approved.add(category);
    }
  }
}
