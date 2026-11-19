import {
  HOST_COMMAND_VARIABLE,
  hostCommandFromEnvironment,
} from '../../conformance/http/node-host';
import { describeHostProcessConformance } from '../../conformance/http/process-cases';

/**
 * The HTTP conformance suite (`conformance/http/README.md`) against a host
 * process: the production Node host by default, or the host command
 * `INFINITY_CUBE_HTTP_CONFORMANCE_HOST` names.
 */
describeHostProcessConformance({
  command: hostCommandFromEnvironment(process.env[HOST_COMMAND_VARIABLE]),
});
