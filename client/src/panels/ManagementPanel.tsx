// Auto-extracted from Home.tsx during the v2 refactor.
// @ts-nocheck — auto-extracted verbatim JSX; shared ctx is typed as any.
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { today, Kind, GradeType, gradeTypeLabels } from "./shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { formatJalali, formatJalaliShort } from "@/lib/jalali";
import { buildReportPrintHtml, printHtmlInIframe, type PrintActivity } from "@/lib/print-report";
import { JalaliDatePicker, Field, Stat, StudentSelect, TeamSelect, QuickButton, Empty, gradeTypeLabels } from "./shared";
import { Check, ClipboardList, Edit3, Medal, Printer, Send, Settings2, Share2, Sparkles, Trash2, TrendingDown, TrendingUp, Users, X } from "lucide-react";
import { trpc } from "@/lib/trpc";

import { Management } from "./ManagementComp";

export function ManagementPanel({ ctx }: { ctx: any }) {
  return (
    <>
            <div className="mobile-panel panel-management"><Management data={{ schools: ctx.schools, classes: ctx.classes, teams: ctx.teams, students: ctx.students }} className={ctx.className} setClassName={ctx.setClassName} teamName={ctx.teamName} setTeamName={ctx.setTeamName} teamClassId={ctx.teamClassId} setTeamClassId={ctx.setTeamClassId} studentFirstName={ctx.studentFirstName} setStudentFirstName={ctx.setStudentFirstName} studentLastName={ctx.studentLastName} setStudentLastName={ctx.setStudentLastName} studentClassId={ctx.studentClassId} setStudentClassId={(value: string) => { ctx.setStudentClassId(value); ctx.setStudentTeamId("none"); }} studentTeamId={ctx.studentTeamId} setStudentTeamId={ctx.setStudentTeamId} studentTeams={ctx.studentTeams} submitClass={ctx.submitClass} submitTeam={ctx.submitTeam} submitStudent={ctx.submitStudent} startEdit={ctx.startEdit} editing={ctx.editing} editName={ctx.editName} setEditName={ctx.setEditName} editTeamId={ctx.editTeamId} setEditTeamId={ctx.setEditTeamId} saveEdit={ctx.saveEdit} cancelEdit={() => ctx.setEditing(null)} confirmDelete={ctx.confirmDelete} deleteClass={ctx.deleteClass} deleteTeam={ctx.deleteTeam} deleteStudent={ctx.deleteStudent} /></div>
    </>
  );
}
