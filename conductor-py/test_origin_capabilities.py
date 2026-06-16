import unittest

from origin_ops.axis_ops import apply_axis_capabilities
from origin_ops.capability_dispatcher import CapabilityPlan, resolve_capability_plan
from origin_ops.style_ops import apply_style_capabilities


class FakeOriginModule:
    def __init__(self):
        self.commands = []

    def lt_exec(self, command):
        self.commands.append(command)
        return True


class OriginCapabilitiesTest(unittest.TestCase):
    def test_resolve_capability_plan_accepts_semantic_axis_schema(self):
        plan = resolve_capability_plan({
            "axis": {
                "appearance": {
                    "x": {"showGrid": False, "showMajorTicks": True},
                    "y": {"showMinorTicks": False},
                },
                "range": {
                    "x": {"from": -1, "to": 1, "step": 0.5},
                },
                "scale": {
                    "y": {"mode": "log"},
                },
                "title": {
                    "x": {"text": "Vd (V)", "fontSize": 22},
                },
                "spacing": {
                    "tickLabelOffset": 45,
                    "axisTitleGap": 80,
                },
                "frame": {
                    "xOpposite": True,
                    "yOpposite": True,
                },
            },
            "style": {
                "legend": {
                    "fontSize": 12,
                },
            },
        })

        self.assertEqual(plan.axis_appearance["x"]["showGrid"], False)
        self.assertEqual(plan.axis_range["x"]["step"], 0.5)
        self.assertEqual(plan.axis_scale["y"]["mode"], "log")
        self.assertEqual(plan.axis_title["x"]["text"], "Vd (V)")
        self.assertEqual(plan.axis_spacing["axisTitleGap"], 80.0)
        self.assertEqual(plan.axis_frame["xOpposite"], True)
        self.assertEqual(plan.style_legend["fontSize"], 12.0)

    def test_resolve_capability_plan_maps_legacy_axis_commands_to_advanced(self):
        plan = resolve_capability_plan({
            "axis": {
                "commands": ["layer.y.type=2"],
                "limits": {
                    "y": {
                        "from": 1e-12,
                        "to": 1e-6,
                        "scale": "log",
                    },
                },
            },
        })

        self.assertEqual(plan.axis_advanced_commands, ["layer.y.type=2"])
        self.assertEqual(plan.axis_range["y"]["from"], 1e-12)
        self.assertEqual(plan.axis_scale["y"]["mode"], "log")

    def test_apply_axis_capabilities_keeps_labtalk_inside_python_adapter(self):
        origin = FakeOriginModule()
        plan = CapabilityPlan(
            axis_appearance={
                "x": {"showGrid": False, "showMajorTicks": False, "showMinorTicks": True},
            },
            axis_frame={"xOpposite": True, "yOpposite": True},
            axis_range={"x": {"from": -1, "to": 1, "step": 0.5}},
            axis_scale={"y": {"mode": "log"}},
            axis_spacing={"tickLabelOffset": 45, "axisTitleGap": 80},
            axis_title={"x": {"text": "Vd (V)", "fontSize": 22}},
            axis_advanced_commands=["// user override"],
        )

        result = apply_axis_capabilities(origin, plan)

        self.assertIn("appearance", result)
        self.assertIn("layer.x.opposite=1;", origin.commands)
        self.assertIn("layer.y.type=2;", origin.commands)
        self.assertIn("layer.x.from=-1;", origin.commands)
        self.assertIn("layer.x.inc=0.5;", origin.commands)
        self.assertIn('label -xb "Vd (V)";', origin.commands)
        self.assertIn("system.tick.gapAxTitle=80;", origin.commands)
        self.assertIn("layer.x.grid.show=0;", origin.commands)
        self.assertIn("layer.x.majorTicks=0;", origin.commands)
        self.assertIn("layer.x.minorTicks=1;", origin.commands)
        self.assertIn("// user override;", origin.commands)

    def test_apply_style_capabilities_keeps_labtalk_inside_python_adapter(self):
        origin = FakeOriginModule()

        apply_style_capabilities(origin, {"fontSize": 12}, [])

        self.assertIn("legend.fsize=12;", origin.commands)


if __name__ == "__main__":
    unittest.main()
