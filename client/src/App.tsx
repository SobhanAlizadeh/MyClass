import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import SuperAdmin from "./pages/SuperAdmin";
import PublicBoard from "./pages/PublicBoard";
function Router() { return <Switch><Route path="/" component={PublicBoard} /><Route path="/admin" component={Home} />
<Route path="/super" component={SuperAdmin} /><Route path="/404" component={NotFound} /><Route component={NotFound} /></Switch>; }
export default function App() { return <ErrorBoundary><ThemeProvider defaultTheme="light" switchable><TooltipProvider><Toaster /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>; }
