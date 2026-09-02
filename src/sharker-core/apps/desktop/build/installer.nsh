# Licensed to the Apache Software Foundation (ASF) under one
# or more contributor license agreements.  See the NOTICE file
# distributed with this work for additional information
# regarding copyright ownership.  The ASF licenses this file
# to you under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License.  You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.

# Abort-path upgrade backup/rollback for the one-click NSIS installer.
#
# Why this exists: electron-builder's default upgrade sequence runs the OLD
# uninstaller (which removes the whole $INSTDIR and the uninstall registry
# keys) before extracting the new files. A failure after that point strands
# the machine with no working install and no rollback source. This include
# adds a verified pre-upgrade backup and an Abort-path restore:
#
#   customInit        (before anything destructive) back up $INSTDIR to a
#                     same-volume sibling, verify the copy, mark it complete,
#                     and snapshot the registry values the template deletes.
#                     A backup failure or an empty registry snapshot fails the
#                     upgrade CLOSED (exit 101) with the old install intact.
#   customFiles_*     (after extraction, worst case: old files gone, new
#                     uninstaller/registry not yet written) test-only
#                     deterministic failpoints, read at run time:
#                     SHARKER_INSTALLER_TEST_FAILPOINT=after-extract aborts here
#                     (the covered path); =after-extract-quit quits here,
#                     pinning the uncovered template Quit shape.
#   .onInstFailed     (any script Abort) two-step same-volume swap: move the
#                     partial new tree aside, move the backup into place, and
#                     only then discard the aside copy -- every intermediate
#                     state keeps at least one complete installation on disk.
#                     Exit 102 when the restore and registry write-back are
#                     verified, 103 otherwise. Every 103 keeps a launchable
#                     tree and recovery metadata; a sibling backup and note
#                     are guaranteed only when that copy completed.
#   customInstall     (success tail) delete the backup and any aside residue.
#
# Recovery story for hookless Quit, and for 103 when the sibling copy exists:
# "<install dir>.pre-upgrade-backup" holds a complete, verified copy plus
# RECOVERY-README.txt. A later installer adopts it only when its version marker
# matches the current or persisted registry snapshot. Every 103 keeps at least
# one launchable tree and recovery metadata, but rebuilding the sibling backup
# after a registry mismatch is best effort; without it, the next installer
# fails closed and manual repair/reinstall is required.
#
# What this does NOT cover (documented in docs/windows-support.md): failures
# that bypass NSIS's Abort path -- the template's own failure branches exit
# via Quit (old uninstaller failure, extraction retry exhaustion), which NSIS
# gives no hook for; a hard kill of the installer process; power loss. On
# those paths the backup and its recovery note are retained but no automatic
# restore runs. The backup copy is not forced through volatile device caches,
# in line with the repository's Windows durability boundary.
#
# Security posture of the failpoint (same narrative as SHARKER_UPDATE_TEST_FEED):
# setting an environment variable on the installer's process already requires
# code execution as the same user, which under the per-user install model can
# rewrite the installation directory directly. The failpoint can only make an
# upgrade fail and roll back -- self-denial-of-service -- and it is read at
# run time (ReadEnvStr), never baked in at compile time. With the variable
# unset the only added behavior is one ReadEnvStr, the pre-upgrade backup,
# and the post-success backup removal.
#
# Compile-order note: this file is prepended to the generated script, before
# common.nsh/multiUser.nsh. Product defines arrive as makensis -D flags and
# are safe everywhere; template defines (INSTALL_REGISTRY_KEY,
# APP_EXECUTABLE_FILENAME, ...) are only safe inside !macro bodies, which
# expand at their insertion points. Functions therefore read exclusively from
# the $sharker* variables assigned in customInit.

!ifndef BUILD_UNINSTALLER

!include LogicLib.nsh

!define SHARKER_EXIT_BACKUP_FAILED 101
!define SHARKER_EXIT_ROLLBACK_OK 102
!define SHARKER_EXIT_ROLLBACK_FAILED 103
!define SHARKER_BACKUP_MARKER ".sharker-backup-complete"
!define SHARKER_RECOVERY_README "RECOVERY-README.txt"
# The registry snapshot is ALSO persisted here, because the template's
# upgrade path deletes the real registration mid-upgrade: if the
# installer then dies on a Quit path (no Abort hook), the next run finds the
# real keys empty. This sibling key is not touched by the uninstaller, so an
# adopted backup can still restore registration across attempts. Deleted on
# every successful install and after every completed restore.
!define SHARKER_SNAPSHOT_REG_KEY "Software\Sharker\PreUpgradeSnapshot"

Var sharkerBackupDir
Var sharkerAsideDir
Var sharkerAppExe
Var sharkerBackupArmed
Var sharkerFailpoint
Var sharkerInstallRegKey
Var sharkerUninstallRegKey
Var sharkerPrevInstallLocation
Var sharkerPrevKeepShortcuts
Var sharkerPrevShortcutName
Var sharkerPrevMenuDirectory
Var sharkerPrevDisplayName
Var sharkerPrevUninstallString
Var sharkerPrevQuietUninstallString
Var sharkerPrevDisplayVersion
Var sharkerPrevDisplayIcon
Var sharkerPrevPublisher
Var sharkerPrevComments

# Sets $R7 to "1" when the directory in $R5 contains any entry besides
# "." and "..", else "0". IfFileExists "dir\*.*" cannot make this
# distinction (it is true for an empty directory), and the difference
# decides whether a blocked-but-empty $INSTDIR shell is recoverable.
Function sharkerDirHasEntries
  StrCpy $R7 "0"
  ClearErrors
  FindFirst $R6 $R4 "$R5\*.*"
  ${If} ${Errors}
    ClearErrors
    Return
  ${EndIf}
  sharkerDirHasEntriesLoop:
    StrCmp $R4 "" sharkerDirHasEntriesDone
    StrCmp $R4 "." sharkerDirHasEntriesNext
    StrCmp $R4 ".." sharkerDirHasEntriesNext
    StrCpy $R7 "1"
    Goto sharkerDirHasEntriesDone
  sharkerDirHasEntriesNext:
    FindNext $R6 $R4
    Goto sharkerDirHasEntriesLoop
  sharkerDirHasEntriesDone:
  FindClose $R6
  ClearErrors
FunctionEnd

# Writes RECOVERY-README.txt into the backup directory (best effort). Called
# at backup-creation time -- not only on failure -- because the paths that
# most need it are the hookless template Quit exits, where no code of ours
# runs after the failure: the note must already be there.
Function sharkerWriteRecoveryReadme
  ClearErrors
  FileOpen $R6 "$sharkerBackupDir\${SHARKER_RECOVERY_README}" w
  ${IfNot} ${Errors}
    FileWrite $R6 "This directory holds a complete copy of a Sharker installation$\r$\n"
    FileWrite $R6 "(version $sharkerPrevDisplayVersion), taken before an upgrade. If you can read$\r$\n"
    FileWrite $R6 "this, that upgrade did not finish.$\r$\n$\r$\n"
    FileWrite $R6 "The safest recovery is to run the Sharker installer again. It adopts this$\r$\n"
    FileWrite $R6 "backup only when it matches the interrupted upgrade snapshot; otherwise$\r$\n"
    FileWrite $R6 "the current installation is left unchanged.$\r$\n$\r$\n"
    FileWrite $R6 "To restore manually instead:$\r$\n"
    FileWrite $R6 "  1. Close Sharker if it is running.$\r$\n"
    FileWrite $R6 "  2. Delete the installation directory: $INSTDIR$\r$\n"
    FileWrite $R6 "  3. Rename this directory to: $INSTDIR$\r$\n"
    FileWrite $R6 "  4. Delete the ${SHARKER_BACKUP_MARKER} and ${SHARKER_RECOVERY_README} files inside it.$\r$\n"
    FileClose $R6
  ${EndIf}
  ClearErrors
FunctionEnd

# Failure-path variant: refresh the note and tell an interactive user where
# the backup is. Silent installs rely on the note alone.
Function sharkerWriteRecoveryNote
  Call sharkerWriteRecoveryReadme
  ${IfNot} ${Silent}
    MessageBox MB_OK|MB_ICONEXCLAMATION "The Sharker upgrade failed. A complete copy of the previous installation was kept at:$\r$\n$sharkerBackupDir$\r$\n$\r$\nSee ${SHARKER_RECOVERY_README} inside it for recovery steps."
  ${EndIf}
FunctionEnd

# Sets $R7 to "1" only when the complete-backup marker belongs to the exact
# source version represented by the registry snapshot this run would restore.
Function sharkerBackupMatchesSnapshot
  StrCpy $R7 "0"
  ${IfNot} ${FileExists} "$sharkerBackupDir\$sharkerAppExe"
    Return
  ${EndIf}
  ClearErrors
  FileOpen $R6 "$sharkerBackupDir\${SHARKER_BACKUP_MARKER}" r
  ${IfNot} ${Errors}
    FileRead $R6 $R4
    FileClose $R6
    ${If} $R4 S== "version=$sharkerPrevDisplayVersion"
      StrCpy $R7 "1"
    ${EndIf}
  ${EndIf}
  ClearErrors
FunctionEnd

# Sets $R7 to "1" only when the required uninstall registration was written
# back exactly. Optional snapshot values remain best effort, but 102 must never
# be reported without the identity and uninstall command the template needs.
Function sharkerRegistryMatchesSnapshot
  StrCpy $R7 "0"
  ClearErrors
  ReadRegStr $R8 SHELL_CONTEXT "$sharkerUninstallRegKey" DisplayName
  ${If} ${Errors}
    ClearErrors
    Return
  ${EndIf}
  StrCmp $R8 "$sharkerPrevDisplayName" 0 sharkerRegistryMatchesSnapshotDone
  ClearErrors
  ReadRegStr $R8 SHELL_CONTEXT "$sharkerUninstallRegKey" UninstallString
  ${If} ${Errors}
    ClearErrors
    Return
  ${EndIf}
  StrCmp $R8 "$sharkerPrevUninstallString" 0 sharkerRegistryMatchesSnapshotDone
  ClearErrors
  ReadRegDWORD $R8 SHELL_CONTEXT "$sharkerUninstallRegKey" NoModify
  ${If} ${Errors}
    ClearErrors
    Return
  ${EndIf}
  StrCmp $R8 "1" 0 sharkerRegistryMatchesSnapshotDone
  ClearErrors
  ReadRegDWORD $R8 SHELL_CONTEXT "$sharkerUninstallRegKey" NoRepair
  ${If} ${Errors}
    ClearErrors
    Return
  ${EndIf}
  StrCmp $R8 "1" 0 sharkerRegistryMatchesSnapshotDone
  StrCpy $R7 "1"
  sharkerRegistryMatchesSnapshotDone:
  ClearErrors
FunctionEnd

# Restores the pre-upgrade state captured by customInit, ordered so that at
# every intermediate point at least one complete installation exists on disk:
#
#   1. move the (complete, launchable) new tree aside -- never delete it
#      before the old one is back;
#   2. move the verified backup into place;
#   3. write the registry snapshot back;
#   4. only then discard the aside copy.
#
# Guarded by $sharkerBackupArmed, which only this run's customInit sets after
# verifying the backup: an Abort during a fresh install, or with a stale
# backup from some earlier attempt, must behave exactly as upstream does
# today rather than resurrect files with an empty registry snapshot.
Function sharkerRestoreFromBackup
  ${If} $sharkerBackupArmed != "1"
    Return
  ${EndIf}
  DetailPrint "Restoring the previous installation from $sharkerBackupDir"
  # Move the working directory out of $INSTDIR so directory operations cannot
  # fail on our own open handle (same precaution as the template uninstaller).
  SetOutPath $PLUGINSDIR

  # Step 1: move the extracted new tree aside. If $INSTDIR does not exist
  # (nothing was extracted), there is nothing to move. The rename is retried
  # briefly first: a scanner or indexer transiently holding one of the
  # hundreds of freshly extracted files is most likely at exactly this
  # moment, and the template's own destructive loops use the same 5x1s
  # cadence.
  ${If} ${FileExists} "$INSTDIR\*.*"
    StrCpy $R3 0
    ${Do}
      ClearErrors
      Rename "$INSTDIR" "$sharkerAsideDir"
      ${IfNot} ${Errors}
        ${Break}
      ${EndIf}
      IntOp $R3 $R3 + 1
      ${If} $R3 >= 5
        ${Break}
      ${EndIf}
      Sleep 1000
    ${Loop}
    ${If} ${Errors}
      # The rename failed -- typically a handle held on the directory itself.
      # An empty shell is still recoverable: the backup can be copied into
      # it. A populated tree that cannot be moved is not: removing it first
      # would create a window with no installation at all, so keep the new
      # (launchable) tree, keep the backup, and report the restore failure.
      StrCpy $R5 "$INSTDIR"
      Call sharkerDirHasEntries
      ${If} $R7 == "1"
        DetailPrint "The new-version tree cannot be moved aside; keeping it and the backup"
        Call sharkerWriteRecoveryNote
        SetErrorLevel ${SHARKER_EXIT_ROLLBACK_FAILED}
        Return
      ${EndIf}
      # Empty shell: try to clear it (non-recursive: only succeeds on empty),
      # then fall through -- if the shell persists, the copy path below fills
      # it in place.
      ClearErrors
      RMDir "$INSTDIR"
      ClearErrors
    ${EndIf}
  ${EndIf}

  # Step 2: bring the backup into place. Prefer the instant same-volume
  # rename (retried on the same cadence as step 1); fall back to copying
  # into a persisting empty shell. Success is judged by the filesystem, not
  # by the error flag (the flag cannot say which of two prior operations set
  # it).
  StrCpy $R3 0
  ${Do}
    ClearErrors
    Rename "$sharkerBackupDir" "$INSTDIR"
    ${IfNot} ${Errors}
      ${Break}
    ${EndIf}
    IntOp $R3 $R3 + 1
    ${If} $R3 >= 5
      ${Break}
    ${EndIf}
    Sleep 1000
  ${Loop}
  ClearErrors
  ${IfNot} ${FileExists} "$INSTDIR\$sharkerAppExe"
    ${If} ${FileExists} "$sharkerBackupDir\$sharkerAppExe"
      # The rename did not take (e.g. the empty $INSTDIR shell persists).
      # Copy the backup into the target instead.
      CreateDirectory "$INSTDIR"
      ClearErrors
      CopyFiles /SILENT "$sharkerBackupDir\*.*" "$INSTDIR"
      ClearErrors
    ${EndIf}
  ${EndIf}
  ${IfNot} ${FileExists} "$INSTDIR\$sharkerAppExe"
    # The old tree is not back. Undo step 1 so the machine keeps the
    # launchable new tree rather than an empty directory, keep the backup,
    # and report the failure.
    ${IfNot} ${FileExists} "$INSTDIR\*.*"
      ClearErrors
      Rename "$sharkerAsideDir" "$INSTDIR"
      ClearErrors
    ${EndIf}
    DetailPrint "Restore failed; keeping $sharkerBackupDir for manual recovery"
    Call sharkerWriteRecoveryNote
    SetErrorLevel ${SHARKER_EXIT_ROLLBACK_FAILED}
    Return
  ${EndIf}

  # Step 3: re-create the registry state the old uninstaller removed.
  # customInit failed closed on an empty snapshot, so UninstallString and
  # DisplayName are known non-empty here; other values are written back only
  # when they existed. NoModify/NoRepair are template constants in every
  # shipped version. EstimatedSize is cosmetic and intentionally not
  # restored.
  ${If} $sharkerPrevInstallLocation != ""
    WriteRegStr SHELL_CONTEXT "$sharkerInstallRegKey" InstallLocation "$sharkerPrevInstallLocation"
  ${EndIf}
  ${If} $sharkerPrevKeepShortcuts != ""
    WriteRegStr SHELL_CONTEXT "$sharkerInstallRegKey" KeepShortcuts "$sharkerPrevKeepShortcuts"
  ${EndIf}
  ${If} $sharkerPrevShortcutName != ""
    WriteRegStr SHELL_CONTEXT "$sharkerInstallRegKey" ShortcutName "$sharkerPrevShortcutName"
  ${EndIf}
  ${If} $sharkerPrevMenuDirectory != ""
    WriteRegStr SHELL_CONTEXT "$sharkerInstallRegKey" MenuDirectory "$sharkerPrevMenuDirectory"
  ${EndIf}
  WriteRegStr SHELL_CONTEXT "$sharkerUninstallRegKey" DisplayName "$sharkerPrevDisplayName"
  WriteRegStr SHELL_CONTEXT "$sharkerUninstallRegKey" UninstallString "$sharkerPrevUninstallString"
  ${If} $sharkerPrevQuietUninstallString != ""
    WriteRegStr SHELL_CONTEXT "$sharkerUninstallRegKey" QuietUninstallString "$sharkerPrevQuietUninstallString"
  ${EndIf}
  ${If} $sharkerPrevDisplayVersion != ""
    WriteRegStr SHELL_CONTEXT "$sharkerUninstallRegKey" DisplayVersion "$sharkerPrevDisplayVersion"
  ${EndIf}
  ${If} $sharkerPrevDisplayIcon != ""
    WriteRegStr SHELL_CONTEXT "$sharkerUninstallRegKey" DisplayIcon "$sharkerPrevDisplayIcon"
  ${EndIf}
  ${If} $sharkerPrevPublisher != ""
    WriteRegStr SHELL_CONTEXT "$sharkerUninstallRegKey" Publisher "$sharkerPrevPublisher"
  ${EndIf}
  ${If} $sharkerPrevComments != ""
    WriteRegStr SHELL_CONTEXT "$sharkerUninstallRegKey" Comments "$sharkerPrevComments"
  ${EndIf}
  WriteRegDWORD SHELL_CONTEXT "$sharkerUninstallRegKey" NoModify 1
  WriteRegDWORD SHELL_CONTEXT "$sharkerUninstallRegKey" NoRepair 1

  # Test-only corruption of one required value proves the read-back gate.
  ${If} $sharkerFailpoint == "abort-registry-mismatch"
    DeleteRegValue SHELL_CONTEXT "$sharkerUninstallRegKey" UninstallString
  ${EndIf}
  Call sharkerRegistryMatchesSnapshot
  ${If} $R7 != "1"
    DetailPrint "Registry write-back could not be verified; keeping recovery evidence"
    # A successful rename consumed the sibling backup into $INSTDIR. Recreate
    # the sibling copy best-effort while keeping the restored tree live; the
    # marker, snapshot key, and aside tree are deliberately not cleaned up.
    ${IfNot} ${FileExists} "$sharkerBackupDir\$sharkerAppExe"
      CreateDirectory "$sharkerBackupDir"
      ClearErrors
      CopyFiles /SILENT "$INSTDIR\*.*" "$sharkerBackupDir"
      ClearErrors
    ${EndIf}
    ${If} ${FileExists} "$sharkerBackupDir\$sharkerAppExe"
      Call sharkerWriteRecoveryNote
    ${Else}
      ${IfNot} ${Silent}
        MessageBox MB_OK|MB_ICONEXCLAMATION "The previous Sharker files were restored, but the uninstall registration could not be verified. Recovery metadata and the extracted replacement were retained. A later installer will refuse this state; inspect the retained files, then repair the registration or remove the installation directory and reinstall Sharker."
      ${EndIf}
    ${EndIf}
    SetErrorLevel ${SHARKER_EXIT_ROLLBACK_FAILED}
    Return
  ${EndIf}

  # Step 4: the restore is complete; the markers must not ship inside the
  # restored tree, and the aside copy -- plus the backup directory itself
  # when the copy fallback (rather than the consuming rename) restored it --
  # is now redundant. All removals are best effort: a scanner holding any of
  # them must not demote a completed restore.
  ClearErrors
  Delete "$INSTDIR\${SHARKER_BACKUP_MARKER}"
  Delete "$INSTDIR\${SHARKER_RECOVERY_README}"
  RMDir /r "$sharkerAsideDir"
  RMDir /r "$sharkerBackupDir"
  DeleteRegKey SHELL_CONTEXT "${SHARKER_SNAPSHOT_REG_KEY}"
  ClearErrors
  DetailPrint "Previous installation restored"
  SetErrorLevel ${SHARKER_EXIT_ROLLBACK_OK}
FunctionEnd

Function .onInstFailed
  Call sharkerRestoreFromBackup
FunctionEnd

!macro customInit
  StrCpy $sharkerBackupDir "$INSTDIR.pre-upgrade-backup"
  StrCpy $sharkerAsideDir "$INSTDIR.failed-upgrade"
  StrCpy $sharkerAppExe "${APP_EXECUTABLE_FILENAME}"
  StrCpy $sharkerInstallRegKey "${INSTALL_REGISTRY_KEY}"
  StrCpy $sharkerUninstallRegKey "${UNINSTALL_REGISTRY_KEY}"
  StrCpy $sharkerBackupArmed "0"
  StrCpy $sharkerFailpoint ""
  ReadEnvStr $R9 SHARKER_INSTALLER_TEST_FAILPOINT
  # S== is case-sensitive: only the exact tokens are accepted.
  ${If} $R9 S== "after-extract"
    StrCpy $sharkerFailpoint "abort"
  ${ElseIf} $R9 S== "after-extract-quit"
    StrCpy $sharkerFailpoint "quit"
  ${ElseIf} $R9 S== "after-extract-registry-mismatch"
    StrCpy $sharkerFailpoint "abort-registry-mismatch"
  ${EndIf}
  ${If} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    # Snapshot the registry values the template's upgrade path deletes, while
    # they still exist (the old uninstaller runs inside the install section,
    # after this hook). The set mirrors registryAddInstallInfo, including the
    # conditional MenuDirectory (reading a missing value yields "" and the
    # write-back skips empty values).
    ReadRegStr $sharkerPrevInstallLocation SHELL_CONTEXT "$sharkerInstallRegKey" InstallLocation
    ReadRegStr $sharkerPrevKeepShortcuts SHELL_CONTEXT "$sharkerInstallRegKey" KeepShortcuts
    ReadRegStr $sharkerPrevShortcutName SHELL_CONTEXT "$sharkerInstallRegKey" ShortcutName
    ReadRegStr $sharkerPrevMenuDirectory SHELL_CONTEXT "$sharkerInstallRegKey" MenuDirectory
    ReadRegStr $sharkerPrevDisplayName SHELL_CONTEXT "$sharkerUninstallRegKey" DisplayName
    ReadRegStr $sharkerPrevUninstallString SHELL_CONTEXT "$sharkerUninstallRegKey" UninstallString
    ReadRegStr $sharkerPrevQuietUninstallString SHELL_CONTEXT "$sharkerUninstallRegKey" QuietUninstallString
    ReadRegStr $sharkerPrevDisplayVersion SHELL_CONTEXT "$sharkerUninstallRegKey" DisplayVersion
    ReadRegStr $sharkerPrevDisplayIcon SHELL_CONTEXT "$sharkerUninstallRegKey" DisplayIcon
    ReadRegStr $sharkerPrevPublisher SHELL_CONTEXT "$sharkerUninstallRegKey" Publisher
    ReadRegStr $sharkerPrevComments SHELL_CONTEXT "$sharkerUninstallRegKey" Comments
    ClearErrors
    ${If} $sharkerPrevUninstallString == ""
    ${OrIf} $sharkerPrevDisplayName == ""
    ${OrIf} $sharkerPrevDisplayVersion == ""
      # The real registration is missing. One legitimate way here: a previous
      # upgrade attempt died on a template Quit path after the old
      # uninstaller deleted the keys. That attempt left a verified backup and
      # persisted its snapshot in SHARKER_SNAPSHOT_REG_KEY -- adopt the snapshot
      # so the upgrade can still complete (or restore) across attempts.
      ${If} ${FileExists} "$sharkerBackupDir\${SHARKER_BACKUP_MARKER}"
        ReadRegStr $sharkerPrevInstallLocation SHELL_CONTEXT "${SHARKER_SNAPSHOT_REG_KEY}" InstallLocation
        ReadRegStr $sharkerPrevKeepShortcuts SHELL_CONTEXT "${SHARKER_SNAPSHOT_REG_KEY}" KeepShortcuts
        ReadRegStr $sharkerPrevShortcutName SHELL_CONTEXT "${SHARKER_SNAPSHOT_REG_KEY}" ShortcutName
        ReadRegStr $sharkerPrevMenuDirectory SHELL_CONTEXT "${SHARKER_SNAPSHOT_REG_KEY}" MenuDirectory
        ReadRegStr $sharkerPrevDisplayName SHELL_CONTEXT "${SHARKER_SNAPSHOT_REG_KEY}" DisplayName
        ReadRegStr $sharkerPrevUninstallString SHELL_CONTEXT "${SHARKER_SNAPSHOT_REG_KEY}" UninstallString
        ReadRegStr $sharkerPrevQuietUninstallString SHELL_CONTEXT "${SHARKER_SNAPSHOT_REG_KEY}" QuietUninstallString
        ReadRegStr $sharkerPrevDisplayVersion SHELL_CONTEXT "${SHARKER_SNAPSHOT_REG_KEY}" DisplayVersion
        ReadRegStr $sharkerPrevDisplayIcon SHELL_CONTEXT "${SHARKER_SNAPSHOT_REG_KEY}" DisplayIcon
        ReadRegStr $sharkerPrevPublisher SHELL_CONTEXT "${SHARKER_SNAPSHOT_REG_KEY}" Publisher
        ReadRegStr $sharkerPrevComments SHELL_CONTEXT "${SHARKER_SNAPSHOT_REG_KEY}" Comments
        ClearErrors
      ${EndIf}
      ${If} $sharkerPrevUninstallString == ""
      ${OrIf} $sharkerPrevDisplayName == ""
      ${OrIf} $sharkerPrevDisplayVersion == ""
        # Fail closed: with neither a registration nor an adoptable snapshot
        # there is nothing a rollback could restore, so a failed upgrade
        # would leave files without an uninstall entry -- and the template's
        # own upgrade path would silently merge trees rather than upgrade.
        # Nothing destructive has happened yet, so refusing here leaves the
        # existing installation fully intact.
        DetailPrint "The existing installation has no uninstall registration; refusing to upgrade"
        ${IfNot} ${Silent}
          MessageBox MB_OK|MB_ICONEXCLAMATION "Sharker cannot upgrade safely because the existing installation has no uninstall registration. Delete the installation directory ($INSTDIR), then run this installer again."
        ${EndIf}
        SetErrorLevel ${SHARKER_EXIT_BACKUP_FAILED}
        Quit
      ${EndIf}
    ${EndIf}
    ${If} ${FileExists} "$sharkerBackupDir\${SHARKER_BACKUP_MARKER}"
      Call sharkerBackupMatchesSnapshot
      ${If} $R7 != "1"
        DetailPrint "The pre-upgrade backup does not match the current installation; refusing to upgrade"
        ${IfNot} ${Silent}
          MessageBox MB_OK|MB_ICONEXCLAMATION "Sharker found a pre-upgrade backup from a different version. The current installation was left unchanged. Move or remove $sharkerBackupDir after inspecting it, then run this installer again."
        ${EndIf}
        SetErrorLevel ${SHARKER_EXIT_BACKUP_FAILED}
        Quit
      ${EndIf}
      # A previous upgrade attempt failed after completing its backup: the
      # current $INSTDIR may hold that attempt's partial residue, so the
      # existing verified backup is the trustworthy recovery source. Adopt
      # it; never overwrite it with a possibly-torn tree.
      DetailPrint "Adopting the complete pre-upgrade backup left by an earlier attempt"
    ${Else}
      ClearErrors
      RMDir /r "$sharkerBackupDir"
      CreateDirectory "$sharkerBackupDir"
      CopyFiles /SILENT "$INSTDIR\*.*" "$sharkerBackupDir"
      ${If} ${Errors}
        # Fail closed: nothing destructive has happened yet (the app kill
        # and the old uninstaller both run later, inside the install
        # section), so refusing the upgrade leaves the existing installation
        # fully intact.
        DetailPrint "Pre-upgrade backup failed; refusing to upgrade"
        RMDir /r "$sharkerBackupDir"
        ${IfNot} ${Silent}
          MessageBox MB_OK|MB_ICONEXCLAMATION "Sharker could not back up the existing installation, so the upgrade was not started. The current version is unchanged."
        ${EndIf}
        SetErrorLevel ${SHARKER_EXIT_BACKUP_FAILED}
        Quit
      ${EndIf}
      # Verify before crossing the destructive boundary: the error flag alone
      # does not establish a usable backup (a partial SHFileOperation can
      # pass it). The application executable is the minimal witness; a
      # mismatch here means the backup cannot be trusted, so fail closed
      # while the old install is still intact.
      ${IfNot} ${FileExists} "$sharkerBackupDir\${APP_EXECUTABLE_FILENAME}"
        DetailPrint "Pre-upgrade backup is incomplete; refusing to upgrade"
        RMDir /r "$sharkerBackupDir"
        ${IfNot} ${Silent}
          MessageBox MB_OK|MB_ICONEXCLAMATION "Sharker could not back up the existing installation, so the upgrade was not started. The current version is unchanged."
        ${EndIf}
        SetErrorLevel ${SHARKER_EXIT_BACKUP_FAILED}
        Quit
      ${EndIf}
      # Mark the backup complete only after verification; the marker is what
      # a later run trusts when deciding to adopt it.
      ClearErrors
      FileOpen $R8 "$sharkerBackupDir\${SHARKER_BACKUP_MARKER}" w
      ${IfNot} ${Errors}
        FileWrite $R8 "version=$sharkerPrevDisplayVersion"
        FileClose $R8
      ${EndIf}
      ClearErrors
      # The recovery note is written NOW, not on failure: the hookless
      # template Quit exits run none of our code after the failure, and they
      # are the main producers of a leftover backup.
      Call sharkerWriteRecoveryReadme
    ${EndIf}
    # Persist the snapshot outside the keys the upgrade deletes, so a later
    # attempt can adopt it if this one dies on a hookless Quit path. Written
    # on the adopt path too (idempotent re-write of the adopted values).
    WriteRegStr SHELL_CONTEXT "${SHARKER_SNAPSHOT_REG_KEY}" InstallLocation "$sharkerPrevInstallLocation"
    WriteRegStr SHELL_CONTEXT "${SHARKER_SNAPSHOT_REG_KEY}" KeepShortcuts "$sharkerPrevKeepShortcuts"
    WriteRegStr SHELL_CONTEXT "${SHARKER_SNAPSHOT_REG_KEY}" ShortcutName "$sharkerPrevShortcutName"
    WriteRegStr SHELL_CONTEXT "${SHARKER_SNAPSHOT_REG_KEY}" MenuDirectory "$sharkerPrevMenuDirectory"
    WriteRegStr SHELL_CONTEXT "${SHARKER_SNAPSHOT_REG_KEY}" DisplayName "$sharkerPrevDisplayName"
    WriteRegStr SHELL_CONTEXT "${SHARKER_SNAPSHOT_REG_KEY}" UninstallString "$sharkerPrevUninstallString"
    WriteRegStr SHELL_CONTEXT "${SHARKER_SNAPSHOT_REG_KEY}" QuietUninstallString "$sharkerPrevQuietUninstallString"
    WriteRegStr SHELL_CONTEXT "${SHARKER_SNAPSHOT_REG_KEY}" DisplayVersion "$sharkerPrevDisplayVersion"
    WriteRegStr SHELL_CONTEXT "${SHARKER_SNAPSHOT_REG_KEY}" DisplayIcon "$sharkerPrevDisplayIcon"
    WriteRegStr SHELL_CONTEXT "${SHARKER_SNAPSHOT_REG_KEY}" Publisher "$sharkerPrevPublisher"
    WriteRegStr SHELL_CONTEXT "${SHARKER_SNAPSHOT_REG_KEY}" Comments "$sharkerPrevComments"
    ClearErrors
    # Clear any aside residue from an interrupted earlier restore, then arm
    # the rollback for this run only.
    RMDir /r "$sharkerAsideDir"
    ClearErrors
    StrCpy $sharkerBackupArmed "1"
  ${EndIf}
!macroend

# Deterministic test-only failures at the worst possible moment: the new
# files are in place, the old install is gone, and the new uninstaller and
# registry entries have not been written yet. "abort" exercises the covered
# rollback path (.onInstFailed runs); "abort-registry-mismatch" proves that a
# failed registry write-back returns 103 without discarding recovery evidence;
# "quit" pins the uncovered template Quit shape -- no hook fires, the backup
# and its marker survive, and the next installer run adopts them.
!macro sharkerFailpointAfterExtract
  ${If} $sharkerFailpoint == "abort"
    DetailPrint "SHARKER_INSTALLER_TEST_FAILPOINT=after-extract hit: aborting deliberately"
    Abort
  ${ElseIf} $sharkerFailpoint == "abort-registry-mismatch"
    DetailPrint "SHARKER_INSTALLER_TEST_FAILPOINT=after-extract-registry-mismatch hit: aborting deliberately"
    Abort
  ${ElseIf} $sharkerFailpoint == "quit"
    DetailPrint "SHARKER_INSTALLER_TEST_FAILPOINT=after-extract-quit hit: quitting deliberately"
    Quit
  ${EndIf}
!macroend

!macro customFiles_x64
  !insertmacro sharkerFailpointAfterExtract
!macroend

!macro customFiles_arm64
  !insertmacro sharkerFailpointAfterExtract
!macroend

!macro customFiles_ia32
  !insertmacro sharkerFailpointAfterExtract
!macroend

!macro customInstall
  # Success tail: the upgrade completed, so the backup and any aside residue
  # are redundant. Invalidate the completeness marker before the best-effort
  # tree removal: if a scanner holds an application file, RMDir may leave the
  # old backup behind. Its old-version marker would make a later upgrade
  # reject the healthy current installation as mismatched recovery state.
  ClearErrors
  Delete "$sharkerBackupDir\${SHARKER_BACKUP_MARKER}"
  Delete "$sharkerBackupDir\${SHARKER_RECOVERY_README}"
  ClearErrors
  ${If} ${FileExists} "$sharkerBackupDir\*.*"
    RMDir /r "$sharkerBackupDir"
  ${EndIf}
  ${If} ${FileExists} "$sharkerAsideDir\*.*"
    RMDir /r "$sharkerAsideDir"
  ${EndIf}
  DeleteRegKey SHELL_CONTEXT "${SHARKER_SNAPSHOT_REG_KEY}"
  ClearErrors
!macroend

!endif
